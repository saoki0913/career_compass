import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbTransactionMock,
  txSelectLimitMock,
  txExecuteMock,
  txInsertValuesMock,
  txCreditInsertReturningMock,
} = vi.hoisted(() => ({
  dbTransactionMock: vi.fn(),
  txSelectLimitMock: vi.fn(),
  txExecuteMock: vi.fn(),
  txInsertValuesMock: vi.fn(),
  txCreditInsertReturningMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: dbTransactionMock,
  },
}));

function createCreditTx() {
  return {
    execute: txExecuteMock,
    insert: vi.fn(() => ({
      values: txInsertValuesMock,
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: txSelectLimitMock,
        })),
      })),
    })),
  };
}

// Renders only the STATIC SQL fragments of a drizzle `sql` template (the StringChunk
// values), skipping bound Param values. This lets us assert that a literal such as
// `now()` is present in the query text rather than supplied as a JS Date parameter.
function renderSqlTemplate(value: unknown, parts: string[] = []): string {
  if (Array.isArray(value)) {
    for (const entry of value) {
      renderSqlTemplate(entry, parts);
    }
    return parts.join("");
  }
  if (typeof value === "string") {
    parts.push(value);
    return parts.join("");
  }
  if (!value || typeof value !== "object") {
    return parts.join("");
  }
  // StringChunk: { value: string[] }
  if (
    value.constructor?.name === "StringChunk" &&
    "value" in value &&
    Array.isArray((value as { value: unknown[] }).value)
  ) {
    for (const fragment of (value as { value: unknown[] }).value) {
      renderSqlTemplate(fragment, parts);
    }
    return parts.join("");
  }
  // Bound Param: not part of the static SQL text.
  if ("value" in value && ("encoder" in value || value.constructor?.name === "Param")) {
    return parts.join("");
  }
  // Nested SQL / sub-templates expose queryChunks.
  if ("queryChunks" in value && Array.isArray((value as { queryChunks: unknown[] }).queryChunks)) {
    for (const chunk of (value as { queryChunks: unknown[] }).queryChunks) {
      renderSqlTemplate(chunk, parts);
    }
  }
  return parts.join("");
}

function collectSqlParamValues(value: unknown, values: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectSqlParamValues(entry, values);
    }
    return values;
  }
  // Raw leaf values that drizzle places directly into queryChunks without a Param
  // wrapper (e.g. a JS Date from `sql`...${new Date()}...``). These are exactly the
  // values postgres-js' argument-array path fails to coerce, so they must be
  // collected for the "no JS Date bound" assertion to actually catch the bug.
  if (value instanceof Date) {
    values.push(value);
    return values;
  }
  if (!value || typeof value !== "object") {
    values.push(value);
    return values;
  }
  if ("value" in value && ("encoder" in value || value.constructor?.name === "Param")) {
    values.push((value as { value: unknown }).value);
    return values;
  }
  if ("queryChunks" in value && Array.isArray((value as { queryChunks: unknown[] }).queryChunks)) {
    for (const chunk of (value as { queryChunks: unknown[] }).queryChunks) {
      collectSqlParamValues(chunk, values);
    }
  }
  return values;
}

describe("updatePlanAllocation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dbTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = createCreditTx();
      return fn(tx);
    });
    txCreditInsertReturningMock.mockResolvedValue([{ balance: 50 }]);
    txInsertValuesMock.mockReturnValue({
      onConflictDoNothing: vi.fn(() => ({
        returning: txCreditInsertReturningMock,
      })),
    });
  });

  it("records the actual balance delta after a plan upgrade", async () => {
    txSelectLimitMock.mockResolvedValueOnce([
      {
        userId: "user-1",
        balance: 294,
        monthlyAllocation: 350,
      },
    ]);
    txExecuteMock.mockResolvedValueOnce([{ previous_balance: 294, balance: 694 }]);

    const { updatePlanAllocation } = await import("@/lib/credits/monthly-reset");
    await updatePlanAllocation("user-1", "pro");

    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(txCreditInsertReturningMock).not.toHaveBeenCalled();
    expect(txInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      amount: 400,
      type: "plan_change",
      balanceAfter: 694,
    }));
  });

  it("skips allocation updates when the current monthly allocation already matches the plan", async () => {
    txSelectLimitMock.mockResolvedValueOnce([
      {
        userId: "user-1",
        balance: 750,
        monthlyAllocation: 750,
      },
    ]);

    const { updatePlanAllocation } = await import("@/lib/credits/monthly-reset");
    await updatePlanAllocation("user-1", "pro");

    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(txExecuteMock).not.toHaveBeenCalled();
    expect(txInsertValuesMock).not.toHaveBeenCalled();
  });

  it("clamps downgrade deltas at zero and records the actual delta", async () => {
    txSelectLimitMock.mockResolvedValueOnce([
      {
        userId: "user-1",
        balance: 6,
        monthlyAllocation: 750,
      },
    ]);
    txExecuteMock.mockResolvedValueOnce([{ previous_balance: 6, balance: 0 }]);

    const { updatePlanAllocation } = await import("@/lib/credits/monthly-reset");
    await updatePlanAllocation("user-1", "free");

    expect(txInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      amount: -6,
      type: "plan_change",
      balanceAfter: 0,
    }));
  });

  it("continues with a locked allocation update when concurrent initialization wins", async () => {
    txSelectLimitMock.mockResolvedValueOnce([]);
    txCreditInsertReturningMock.mockResolvedValueOnce([]);
    txExecuteMock.mockResolvedValueOnce([{ previous_balance: 50, balance: 350 }]);

    const { updatePlanAllocation } = await import("@/lib/credits/monthly-reset");
    await updatePlanAllocation("user-1", "standard");

    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(txCreditInsertReturningMock).toHaveBeenCalledTimes(1);
    expect(txExecuteMock).toHaveBeenCalledTimes(1);
    expect(txInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      amount: 300,
      type: "plan_change",
      balanceAfter: 350,
    }));
  });

  it("lets webhook handlers run allocation updates inside their existing transaction", async () => {
    const tx = createCreditTx();
    txSelectLimitMock.mockResolvedValueOnce([
      {
        userId: "user-1",
        balance: 294,
        monthlyAllocation: 350,
      },
    ]);
    txExecuteMock.mockResolvedValueOnce([{ previous_balance: 294, balance: 694 }]);

    const { updatePlanAllocationCoreTx } = await import("@/lib/credits/monthly-reset");
    await Reflect.apply(updatePlanAllocationCoreTx, null, [tx, "user-1", "pro"]);

    expect(dbTransactionMock).not.toHaveBeenCalled();
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(txInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      amount: 400,
      type: "plan_change",
      balanceAfter: 694,
    }));
  });

  it("does not bind nullable expected allocation params for ordinary webhook allocation updates", async () => {
    const tx = createCreditTx();
    txSelectLimitMock.mockResolvedValueOnce([
      {
        userId: "user-1",
        balance: 294,
        monthlyAllocation: 350,
      },
    ]);
    txExecuteMock.mockResolvedValueOnce([{ previous_balance: 294, balance: 694 }]);

    const { updatePlanAllocationCoreTx } = await import("@/lib/credits/monthly-reset");
    await Reflect.apply(updatePlanAllocationCoreTx, null, [tx, "user-1", "pro"]);

    const [query] = txExecuteMock.mock.calls[0] ?? [];
    const paramValues = collectSqlParamValues(query);
    expect(paramValues).not.toContain(null);
    expect(paramValues).not.toContain("");
  });

  it("uses a concrete expected allocation guard only when one is provided", async () => {
    const tx = createCreditTx();
    txSelectLimitMock.mockResolvedValueOnce([
      {
        userId: "user-1",
        balance: 294,
        monthlyAllocation: 350,
      },
    ]);
    txExecuteMock.mockResolvedValueOnce([]);

    const { updatePlanAllocationCoreTx } = await import("@/lib/credits/monthly-reset");
    await Reflect.apply(updatePlanAllocationCoreTx, null, [tx, "user-1", "pro", 350]);

    const [query] = txExecuteMock.mock.calls[0] ?? [];
    const paramValues = collectSqlParamValues(query);
    expect(paramValues).toContain(350);
    expect(txInsertValuesMock).not.toHaveBeenCalledWith(expect.objectContaining({
      type: "plan_change",
    }));
  });

  // Regression guard: the raw timestamp columns must be written with the SQL `now()`
  // function, never a bound JS Date parameter. drizzle's db.execute(sql`...`) routes
  // through postgres-js `client.unsafe(query, paramsArray)`, whose argument-array path
  // does NOT coerce a Date and throws `ERR_INVALID_ARG_TYPE: ... Received an instance of
  // Date` before the query reaches Postgres. Binding a Date here would surface as a 500
  // in the checkout.session.completed webhook (free->pro allocation change).
  it("writes timestamp columns via now() and never binds a JS Date parameter", async () => {
    const tx = createCreditTx();
    txSelectLimitMock.mockResolvedValueOnce([
      {
        userId: "user-1",
        balance: 50,
        monthlyAllocation: 50,
      },
    ]);
    txExecuteMock.mockResolvedValueOnce([{ previous_balance: 50, balance: 750 }]);

    const { updatePlanAllocationCoreTx } = await import("@/lib/credits/monthly-reset");
    await Reflect.apply(updatePlanAllocationCoreTx, null, [tx, "user-1", "pro"]);

    const [query] = txExecuteMock.mock.calls[0] ?? [];
    const queryText = renderSqlTemplate(query);
    const paramValues = collectSqlParamValues(query);

    // No Date instance may be bound as a parameter.
    expect(paramValues.some((value) => value instanceof Date)).toBe(false);
    // The timestamp columns must be set using the SQL now() function instead.
    expect(queryText).toMatch(/last_reset_at\s*=\s*now\(\)/i);
    expect(queryText).toMatch(/updated_at\s*=\s*now\(\)/i);
  });
});

describe("grantMonthlyCredits", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dbTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = createCreditTx();
      return fn(tx);
    });
    txInsertValuesMock.mockReturnValue(undefined);
  });

  it("records exactly one monthly grant when the locked row is updated", async () => {
    txExecuteMock.mockResolvedValueOnce([{ previous_balance: 12, balance: 350 }]);

    const { grantMonthlyCredits } = await import("@/lib/credits/monthly-reset");
    await grantMonthlyCredits("user-1");

    expect(txInsertValuesMock).toHaveBeenCalledTimes(1);
    expect(txInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      amount: 338,
      type: "monthly_grant",
      status: "applied",
      balanceAfter: 350,
    }));
  });

  it("does not insert a duplicate ledger row when the user was already reset this month", async () => {
    txExecuteMock.mockResolvedValueOnce([]);

    const { grantMonthlyCredits } = await import("@/lib/credits/monthly-reset");
    await grantMonthlyCredits("user-1");

    expect(txInsertValuesMock).not.toHaveBeenCalled();
  });

  // Regression guard: same ERR_INVALID_ARG_TYPE failure mode as the plan-allocation
  // path. The monthly grant must set timestamp columns via the SQL now() function and
  // must not bind a JS Date parameter into the raw db.execute(sql`...`) template.
  it("writes timestamp columns via now() and never binds a JS Date parameter", async () => {
    txExecuteMock.mockResolvedValueOnce([{ previous_balance: 12, balance: 350 }]);

    const { grantMonthlyCredits } = await import("@/lib/credits/monthly-reset");
    await grantMonthlyCredits("user-1");

    const [query] = txExecuteMock.mock.calls[0] ?? [];
    const queryText = renderSqlTemplate(query);
    const paramValues = collectSqlParamValues(query);

    expect(paramValues.some((value) => value instanceof Date)).toBe(false);
    expect(queryText).toMatch(/last_reset_at\s*=\s*now\(\)/i);
    expect(queryText).toMatch(/updated_at\s*=\s*now\(\)/i);
  });
});
