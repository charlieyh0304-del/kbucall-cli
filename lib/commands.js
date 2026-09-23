/**
 * 명령 구현.
 *
 * 모든 출력은 평문 한 줄씩이다. 표나 색으로 정보를 전달하지 않는다 —
 * 스크린리더가 읽는 순서 그대로가 의미가 되어야 한다.
 */

import * as api from './api.js';
import * as config from './config.js';
import { resolveAddress } from './address.js';
import { ask, askSecret, canAsk, confirm, line } from './prompt.js';

const STATUS_TEXT = {
  pending: '접수 대기',
  running: '접수 요청 중',
  success: '접수 완료',
  failed: '접수 실패',
  cancelled: '취소됨',
  done: '이용 완료',
};

const PHASE_TEXT = {
  submitted: '차량 검색 전',
  searching: '차량 검색 중',
  dispatched: '차량 배정, 이동 중',
  boarding: '탑승 후 운행 중',
  disembarked: '하차 완료',
};

function requireToken() {
  const token = config.getToken();
  if (!token) {
    throw new Error('로그인이 필요합니다. kbucall login 을 먼저 실행하세요.');
  }
  return token;
}

function formatWhen(iso) {
  const d = new Date(iso);
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours()}시 ${mm}분`;
}

/** "+10m", "14:30", "2026-09-24T14:30" 을 ISO로. 생략하면 5분 뒤. */
export function resolveRunAt(at) {
  if (!at) return new Date(Date.now() + 5 * 60_000).toISOString();

  const rel = at.match(/^\+(\d+)m$/);
  if (rel) return new Date(Date.now() + Number(rel[1]) * 60_000).toISOString();

  const hhmm = at.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const d = new Date();
    d.setHours(Number(hhmm[1]), Number(hhmm[2]), 0, 0);
    if (d.getTime() < Date.now()) {
      throw new Error(`${at} 은 이미 지난 시각입니다. 날짜까지 쓰거나 +10m 형식을 쓰세요.`);
    }
    return d.toISOString();
  }

  // 시간대 접미사가 없으면 기기 로컬 시간대로 해석된다.
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) throw new Error(`시각을 이해하지 못했습니다: ${at}`);
  if (d.getTime() < Date.now() - 10 * 60_000) {
    throw new Error('10분보다 더 지난 시각은 접수되지 않습니다.');
  }
  return d.toISOString();
}

export async function login() {
  if (!canAsk()) {
    throw new Error('로그인은 직접 입력이 필요합니다. 터미널에서 실행하세요.');
  }
  line('복지콜 계정으로 로그인합니다. 복지콜 앱에 쓰는 이름, 전화번호, 비밀번호입니다.');
  const memberName = await ask('이름: ');
  const phone = await ask('전화번호: ');
  const password = await askSecret('복지콜 비밀번호 (화면에 표시되지 않습니다): ');

  const out = await api.login({ memberName, phone, password });
  config.save({ token: out.token, memberName: out.memberName, savedAt: new Date().toISOString() });

  line(`로그인되었습니다. ${out.memberName}님.`);
  if (out.isNewUser) line('복지콜 예약 계정이 새로 만들어졌습니다.');
  line(`토큰을 ${config.describeLocation()} 에 저장했습니다. 비밀번호는 저장하지 않습니다.`);
}

export function logout() {
  config.clear();
  line('로그아웃되었습니다. 저장된 토큰을 지웠습니다.');
}

export async function whoami() {
  const token = requireToken();
  const saved = config.load();
  const { bookings } = await api.listBookings(token);
  const name = saved.memberName ? `${saved.memberName}님으로 ` : '';
  line(`${name}로그인되어 있습니다. 예약 ${bookings.length}건이 있습니다.`);
}

export async function book(args) {
  const token = requireToken();
  const runAt = resolveRunAt(args.at);

  const pickup = await resolveAddress('출발지', args.pickup, token);
  const dropoff = await resolveAddress('도착지', args.dropoff, token);
  const via = args.via ? await resolveAddress('경유지', args.via, token) : undefined;

  line('');
  line('접수할 내용입니다.');
  line(`출발지: ${pickup}${args.fromDetail ? `, ${args.fromDetail}` : ''}`);
  if (via) line(`경유지: ${via}`);
  line(`도착지: ${dropoff}${args.toDetail ? `, ${args.toDetail}` : ''}`);
  line(`시각: ${formatWhen(runAt)}`);
  line('');

  if (args.dryRun) {
    line('확인만 했습니다. 접수하지 않았습니다.');
    return;
  }

  if (!args.yes) {
    if (!canAsk()) {
      throw new Error(
        '접수 전 확인을 받을 수 없는 환경입니다. 위 내용을 사용자에게 확인받은 뒤 --yes 를 붙여 다시 실행하세요.',
      );
    }
    if (!await confirm('이대로 접수할까요?')) {
      line('접수하지 않았습니다.');
      return;
    }
  }

  const id = crypto.randomUUID();
  await api.createBooking({
    id,
    runAt,
    pickupQuery: pickup,
    ...(args.fromDetail ? { pickupDetail: args.fromDetail } : {}),
    dropoffQuery: dropoff,
    ...(args.toDetail ? { dropoffDetail: args.toDetail } : {}),
    ...(via ? { viaQuery: via } : {}),
    status: 'pending',
    source: 'kbucall-cli',
  }, token);

  line(`예약이 등록되었습니다. 예약 번호 ${id}`);

  // 5분 이내면 서버가 즉시 접수를 시작하므로 결과가 나올 때까지 기다린다.
  if (new Date(runAt).getTime() > Date.now() + 5 * 60_000) {
    line('예약한 시각이 되면 자동으로 접수됩니다.');
    return;
  }

  const result = await waitForResult(token, id);
  if (!result) {
    line('접수가 평소보다 오래 걸리고 있습니다. kbucall list 로 나중에 확인해주세요.');
  } else if (result.status === 'success') {
    line('접수 완료되었습니다.');
    if (result.callPhase) line(`현재 단계: ${PHASE_TEXT[result.callPhase] || result.callPhase}`);
  } else {
    line(`접수 실패. ${result.errorMessage || '알 수 없는 오류'}`);
    process.exitCode = 1;
  }
}

async function waitForResult(token, id, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let announced = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    let booking;
    try {
      ({ booking } = await api.getBooking(id, token));
    } catch {
      continue; // 일시 오류는 다음 폴링에서 재시도
    }
    if (!booking) continue;
    if (booking.status === 'running' && !announced) {
      announced = true;
      line('복지콜 서버에 접수 요청 중입니다.');
    }
    if (booking.status === 'success' || booking.status === 'failed') return booking;
  }
  return null;
}

export async function list() {
  const token = requireToken();
  const { bookings } = await api.listBookings(token);
  const active = bookings
    .filter((b) => ['pending', 'running', 'success'].includes(b.status))
    .sort((a, b) => new Date(a.runAt) - new Date(b.runAt));

  if (active.length === 0) {
    line('진행 중인 예약이 없습니다.');
    return;
  }

  line(`진행 중인 예약 ${active.length}건입니다.`);
  active.forEach((b, i) => {
    const phase = b.callPhase ? `, ${PHASE_TEXT[b.callPhase] || b.callPhase}` : '';
    line('');
    line(`${i + 1}. ${formatWhen(b.runAt)}`);
    line(`   ${b.pickupQuery} 에서 ${b.dropoffQuery}`);
    line(`   ${STATUS_TEXT[b.status] || b.status}${phase}`);
    if (b.errorMessage) line(`   ${b.errorMessage}`);
    line(`   예약 번호 ${b.id}`);
  });
}

export async function cancel(args) {
  const token = requireToken();

  if (!args.yes) {
    if (!canAsk()) throw new Error('취소 확인을 받을 수 없는 환경입니다. --yes 를 붙여 실행하세요.');
    if (!await confirm('접수된 차량을 취소할까요?')) {
      line('취소하지 않았습니다.');
      return;
    }
  }

  const out = await api.cancelCall(token);
  if (out.success === false) {
    line(`취소하지 못했습니다. ${out.error || '알 수 없는 이유'}`);
    process.exitCode = 1;
    return;
  }
  line('취소되었습니다.');
}

export async function remove(args) {
  const token = requireToken();
  if (!args.id) throw new Error('예약 번호가 필요합니다. kbucall list 로 확인하세요.');
  await api.deleteBooking(args.id, token);
  line('예약을 지웠습니다.');
}
