export interface BaseMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export type RawMessage = {
  id?: string;
  role: string;
  content: unknown;
};

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };
