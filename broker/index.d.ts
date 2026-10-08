import type { IncomingMessage, ServerResponse } from 'node:http';

export default function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void>;
export function isValidExtensionRedirect(uri: string): boolean;
export function getAllowedExtensionIds(): string[];
export function encryptTokenTicket(payload: { token: string; exp: number; ext?: string; jti?: string }): string;
export function decryptTokenTicket(ticket: string): { token: string; exp: number; ext?: string; jti?: string } | null;
export function consumeTicket(ticketId: string, expiresAt: number): Promise<boolean>;
