#!/usr/bin/env node
/**
 * 복지콜 예약 CLI.
 *
 * 복지콜 예약 API를 부르는 얇은 클라이언트다. 접수 전 확인 절차는
 * 복지콜 앱 화면과 같은 규칙을 따른다 — API.md의 "접수 전 확인 의무" 참고.
 */

import * as commands from '../lib/commands.js';
import { errorLine, line } from '../lib/prompt.js';

const HELP = `복지콜 예약을 터미널에서 합니다.

사용법:
  kbucall login                 복지콜 계정으로 로그인합니다
  kbucall logout                저장된 토큰을 지웁니다
  kbucall whoami                로그인 상태를 확인합니다
  kbucall book <출발지> <도착지>   예약을 접수합니다
  kbucall list                  진행 중인 예약을 봅니다
  kbucall cancel                접수된 차량을 취소합니다
  kbucall rm <예약번호>           접수 전 예약을 지웁니다

book 옵션:
  --at <시각>        +10m 또는 14:30 또는 2026-09-24T14:30. 생략하면 5분 뒤
  --via <주소>       경유지
  --from-detail <문자열>   출발지 상세주소. 동, 호수 등
  --to-detail <문자열>     도착지 상세주소
  --dry-run         주소 확인까지만 하고 접수하지 않습니다
  --yes             접수 전 확인을 건너뜁니다. 후보가 여러 개면 그래도 멈춥니다

예시:
  kbucall book "둔촌동 1376-1" "여의도동 2" --at +10m
  kbucall book "둔촌동 1376-1" "여의도동 2" --dry-run

주소는 지번으로 넣으면 가장 잘 찾습니다. 복지콜 접수가 지번 기준이기 때문입니다.

환경변수:
  KBUCALL_TOKEN     저장된 토큰 대신 이 값을 씁니다
  KBUCALL_CONFIG    토큰을 저장할 파일 경로
`;

function parse(argv) {
  const args = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--yes' || a === '-y') args.yes = true;
    else if (a === '--at') args.at = argv[++i];
    else if (a === '--via') args.via = argv[++i];
    else if (a === '--from-detail') args.fromDetail = argv[++i];
    else if (a === '--to-detail') args.toDetail = argv[++i];
    else if (a.startsWith('-')) throw new Error(`알 수 없는 옵션: ${a}`);
    else args.positional.push(a);
  }
  return args;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    line(HELP);
    return;
  }
  if (command === '--version' || command === '-v') {
    line('0.1.0');
    return;
  }

  const args = parse(rest);

  switch (command) {
    case 'login':
      return commands.login();
    case 'logout':
      return commands.logout();
    case 'whoami':
      return commands.whoami();
    case 'book': {
      const [pickup, dropoff] = args.positional;
      if (!pickup || !dropoff) {
        throw new Error('출발지와 도착지가 필요합니다. 예: kbucall book "둔촌동 1376-1" "여의도동 2"');
      }
      return commands.book({ ...args, pickup, dropoff });
    }
    case 'list':
      return commands.list();
    case 'cancel':
      return commands.cancel(args);
    case 'rm':
      return commands.remove({ ...args, id: args.positional[0] });
    default:
      throw new Error(`알 수 없는 명령입니다: ${command}. kbucall help 로 사용법을 볼 수 있습니다.`);
  }
}

main().catch((err) => {
  errorLine(`오류: ${err.message}`);
  if (err.remainingAttempts !== undefined) {
    errorLine(`남은 시도 횟수: ${err.remainingAttempts}`);
  }
  if (err.lockedOut) {
    errorLine('로그인 시도가 제한되었습니다. 잠시 후 다시 시도해주세요.');
  }
  if (err.unauthorized) {
    errorLine('kbucall login 으로 다시 로그인하세요.');
  }
  process.exitCode = 1;
});
