import { useCallback } from "react";

export function useLumenAuth() {
  const authed = true;
  const login = useCallback((_password: string): boolean => true, []);
  const logout = useCallback(() => {}, []);
  return { authed, login, logout };
}