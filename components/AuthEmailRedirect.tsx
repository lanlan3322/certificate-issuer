"use client";

import { useEffect } from "react";
import { withBasePath } from "../lib/site";

export default function AuthEmailRedirect() {
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const type = fragment.get("type");
    if (type !== "recovery" && type !== "invite") return;
    const issuerPath = withBasePath("/issuer/");
    if (window.location.pathname.replace(/\/$/, "") === issuerPath.replace(/\/$/, "")) return;
    window.location.replace(`${issuerPath}?mode=reset${window.location.hash}`);
  }, []);
  return null;
}
