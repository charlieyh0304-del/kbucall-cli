/**
 * 토큰 보관.
 *
 * 복지콜 비밀번호는 저장하지 않는다. 로그인할 때 한 번 보내고 버린다.
 * 서버가 암호화해 보관하고 접수할 때 복지콜에 로그인하는 데 쓴다.
 * 여기 남는 건 90일짜리 토큰뿐이다.
 */

import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';

function configPath() {
  if (process.env.KBUCALL_CONFIG) return process.env.KBUCALL_CONFIG;
  if (platform() === 'win32') {
    const base = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
    return join(base, 'kbucall', 'config.json');
  }
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'kbucall', 'config.json');
}

export function load() {
  try {
    return JSON.parse(readFileSync(configPath(), 'utf8'));
  } catch {
    return {};
  }
}

export function save(data) {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
  // 토큰이 들어 있으므로 본인만 읽게 한다. Windows는 chmod가 의미 없어 건너뛴다.
  if (platform() !== 'win32') {
    try {
      chmodSync(path, 0o600);
    } catch {
      // 권한 변경에 실패해도 로그인 자체는 성공시킨다.
    }
  }
}

export function clear() {
  try {
    rmSync(configPath());
  } catch {
    // 파일이 없으면 이미 로그아웃된 상태다.
  }
}

/** 환경변수 토큰이 있으면 그것을 우선한다. CI나 스크립트에서 쓰기 위한 것. */
export function getToken() {
  return process.env.KBUCALL_TOKEN || load().token || null;
}

export function describeLocation() {
  return configPath();
}
