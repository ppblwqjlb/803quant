import { PrototypeApp } from "./prototype-app";
import { getSystemContext } from "../lib/server/system-context";

export const dynamic = "force-dynamic";

export default async function Home() {
  return <PrototypeApp initialContext={getSystemContext()} />;
}
