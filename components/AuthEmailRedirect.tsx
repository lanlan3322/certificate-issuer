"use client";

import { useEffect } from "react";
import { withBasePath } from "../lib/site";

export default function AuthEmailRedirect() {
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const queryType = query.get("type");
    const tokenHash = query.get("token_hash") ?? query.get("token");
    if (tokenHash && (queryType === "recovery" || queryType === "invite")) {
      const recoveryPath = withBasePath("/auth/recovery/");
      if (window.location.pathname.replace(/\/$/, "") === recoveryPath.replace(/\/$/, "")) return;
      const recoveryQuery = new URLSearchParams({ token_hash: tokenHash, type: queryType });
      window.location.replace(`${recoveryPath}?${recoveryQuery}`);
      return;
    }
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const type = fragment.get("type");
    if (type !== "recovery" && type !== "invite") return;
    const issuerPath = withBasePath("/issuer/");
    if (window.location.pathname.replace(/\/$/, "") === issuerPath.replace(/\/$/, "")) return;
    window.location.replace(`${issuerPath}?mode=reset${window.location.hash}`);
  }, []);
  return null;
}
