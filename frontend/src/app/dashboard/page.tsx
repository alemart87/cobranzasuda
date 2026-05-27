"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Redirige al nuevo hub de Operativas
export default function DashboardRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/operativas");
  }, [router]);
  return null;
}
