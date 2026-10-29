import type { ReactNode } from 'react';
import './globals.css';
export const metadata = { title: 'LDI Payload Hub', description: 'One workspace for projects, agents, and payloads.' };
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
