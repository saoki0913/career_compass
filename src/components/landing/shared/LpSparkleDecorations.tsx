type SparkleItem = {
  x: number;
  y: number;
  size: number;
  opacity: number;
  color?: string;
  type?: "star" | "dot";
};

type Props = {
  sparkles: readonly SparkleItem[];
};

export function LpSparkleDecorations({ sparkles }: Props) {
  return (
    <>
      {sparkles.map((s, i) => (
        <span
          key={i}
          className="pointer-events-none absolute"
          aria-hidden="true"
          style={{ left: `${s.x}%`, top: `${s.y}%`, opacity: s.opacity }}
        >
          {s.type === "dot" ? (
            <svg
              width={s.size}
              height={s.size}
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle cx="12" cy="12" r="5" fill={s.color ?? "#b9d8ff"} />
            </svg>
          ) : (
            <svg
              width={s.size}
              height={s.size}
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M12 0C13 9 15 11 24 12C15 13 13 15 12 24C11 15 9 13 0 12C9 11 11 9 12 0Z"
                fill={s.color ?? "#b9d8ff"}
              />
            </svg>
          )}
        </span>
      ))}
    </>
  );
}
