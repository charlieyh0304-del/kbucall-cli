/**
 * 복지콜 예약 API 호출.
 *
 * 명세: https://github.com/charlieyh0304-del/kbucall-integration/blob/main/API.md
 */

const BASE = process.env.KBUCALL_BASE || 'https://kbucall.pages.dev';

export class ApiError extends Error {
  constructor(message, extra = {}) {
    super(message);
    Object.assign(this, extra);
  }
}

async function call(path, { method = 'GET', token, body } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    throw new ApiError(`복지콜 서버에 연결하지 못했습니다. ${err.message}`);
  }

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError(`응답을 읽지 못했습니다. HTTP ${res.status}`);
  }

  if (!res.ok) {
    // error 값은 그대로 사용자에게 읽어줘도 되는 한국어 문장이다.
    throw new ApiError(json.error || `요청이 실패했습니다. HTTP ${res.status}`, {
      status: res.status,
      unauthorized: json.unauthorized,
      lockedOut: json.lockedOut,
      remainingAttempts: json.remainingAttempts,
    });
  }
  return json;
}

export function login({ memberName, phone, password }) {
  return call('/api/auth/kbucall-login', { method: 'POST', body: { memberName, phone, password } });
}

export function resolvePlace(query, token) {
  return call(`/api/kbucall/place?query=${encodeURIComponent(query)}`, { token });
}

export function createBooking(booking, token) {
  return call('/api/data/bookings', { method: 'POST', token, body: booking });
}

export function getBooking(id, token) {
  return call(`/api/data/bookings?id=${encodeURIComponent(id)}`, { token });
}

export function listBookings(token) {
  return call('/api/data/bookings', { token });
}

export function deleteBooking(id, token) {
  return call(`/api/data/bookings?id=${encodeURIComponent(id)}`, { method: 'DELETE', token });
}

export function cancelCall(token) {
  return call('/api/data/cancel-call', { method: 'POST', token });
}
