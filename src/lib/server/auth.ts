import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';

const INTERNAL_API_TOKEN = env.INTERNAL_API_TOKEN;
const INTERNAL_API_BASE = 'http://localhost:8080';

if (!INTERNAL_API_TOKEN) {
	throw new Error('INTERNAL_API_TOKEN environment variable is required');
}

export interface AuthResponse {
	success: boolean;
	error?: string;
	details?: any;
	requiresTOTP?: boolean;
	account?: {
		username: string;
		displayName?: string;
		hasTOTP: boolean;
		avatarUrl?: string;
	};
	token?: string;
}

export interface TOTPSetupResponse {
	success: boolean;
	error?: string;
	otpauth_url?: string;
	secret?: string;
	backupCodes?: string[];
	message?: string;
}

export interface TodoItem {
	id: string;
	text: string;
	completed: boolean;
}

export interface Task {
	id: string;
	title: string;
	items: Record<string, TodoItem>;
}

export interface Todo {
	id: string;
	title: string;
	description: string;
	completed: boolean;
	tags: string[];
	createdAt: string;
	updatedAt: string;
	public: boolean;
	tasks: Record<string, Task>;
	pinned: boolean;
}

export interface Tag {
	id: string;
	name: string;
	color: string;
}

export interface Board {
	todos: Record<string, Todo>;
	tags: Tag[];
}

export interface BoardResponse {
	success: boolean;
	error?: string;
	board?: Board;
}

/**
 * Make a request to the internal API
 */
export async function makeInternalRequest(
	f: typeof fetch = fetch,
	endpoint: string,
	body: any,
	method: string = 'POST',
	basePath = '/internal'
): Promise<Response> {
	console.log(`${INTERNAL_API_BASE}${basePath}${endpoint}`);
	const response = await f(`${INTERNAL_API_BASE}${basePath}${endpoint}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			'x-internal': INTERNAL_API_TOKEN
		},
		body: body ? JSON.stringify(body) : undefined
	});

	return response;
}

/**
 * Set authentication token in secure cookie
 */
export function setAuthToken(cookies: Cookies, token: string) {
	
	cookies.set('auth_token', token, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'strict',
		maxAge: 60 * 60 * 24 
	});
	
	
	cookies.set('auth_token_js', token, {
		path: '/',
		httpOnly: false, 
		secure: true,
		sameSite: 'strict',
		maxAge: 60 * 60 * 24 
	});
}

/**
 * Get authentication token from cookie
 */
export function getAuthToken(cookies: Cookies): string | undefined {
	return cookies.get('auth_token');
}

/**
 * Clear authentication token cookie
 */
export function clearAuthToken(cookies: Cookies) {
	cookies.delete('auth_token', {
		path: '/'
	});
	cookies.delete('auth_token_js', {
		path: '/'
	});
}

/**
 * Verify token and get user info
 */
export async function verifyToken(token: string): Promise<AuthResponse> {
	const response = await makeInternalRequest(fetch, '/accounts/verify-token', { token });
	return await response.json();
}

/**
 * Get current user from cookie token
 */
export async function getCurrentUser(cookies: Cookies): Promise<AuthResponse | null> {
	const token = getAuthToken(cookies);
	if (!token) {
		return null;
	}

	try {
		const result = await verifyToken(token);
		if (result.success) {
			return result;
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Get public user info by username
 */
export async function getUserInfo(username: string): Promise<{
	success: boolean;
	error?: string;
	user?: {
		displayName?: string;
		avatarUrl?: string;
	};
}> {
	try {
		const response = await makeInternalRequest(fetch, '/accounts/get-user-info', { username });
		return await response.json();
	} catch (error) {
		return {
			success: false,
			error: 'Failed to fetch user info'
		};
	}
}

/**
 * Get board data (todos and tags) by user ID
 */
export async function getBoardData(userId: string, f: typeof fetch = fetch): Promise<BoardResponse> {
	try {
		const response = await makeInternalRequest(f, '/boards/get', { userId });
		return await response.json();
	} catch (error) {
		return {
			success: false,
			error: 'Failed to fetch board data'
		};
	}
}
