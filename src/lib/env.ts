import { config } from "dotenv";

export function loadEnv(): void {
  config({ path: ".env.local" });
  config();
}
