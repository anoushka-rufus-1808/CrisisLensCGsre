import { ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  const { user } = useAuth();

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}