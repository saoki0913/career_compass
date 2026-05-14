import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  account,
  accounts,
  session,
  sessions,
  user,
  users,
  verification,
  verifications,
} from "./schema";

function columnNames(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).columns.map((column) => column.name);
}

describe("Better Auth database schema", () => {
  it("exports singular aliases expected by the Drizzle adapter", () => {
    expect(user).toBe(users);
    expect(session).toBe(sessions);
    expect(account).toBe(accounts);
    expect(verification).toBe(verifications);
  });

  it("contains Better Auth Admin user and session fields", () => {
    expect(columnNames(users)).toEqual(
      expect.arrayContaining(["role", "banned", "ban_reason", "ban_expires"]),
    );
    expect(columnNames(sessions)).toEqual(expect.arrayContaining(["impersonated_by"]));
  });

  it("contains core Better Auth OAuth tables", () => {
    expect(columnNames(accounts)).toEqual(
      expect.arrayContaining([
        "account_id",
        "provider_id",
        "access_token",
        "refresh_token",
        "access_token_expires_at",
        "refresh_token_expires_at",
      ]),
    );
    expect(columnNames(verifications)).toEqual(
      expect.arrayContaining(["identifier", "value", "expires_at"]),
    );
  });
});
