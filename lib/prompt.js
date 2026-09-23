/**
 * 터미널 입력.
 *
 * 출력에 색, 스피너, 박스 문자를 쓰지 않는다. 스크린리더로 읽을 때 방해가 된다.
 * 진행 표시도 한 줄씩 평문으로만 낸다.
 */

import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';

/** 사용자에게 물어볼 수 있는 상황인지. 파이프 실행이나 에이전트 호출이면 false. */
export function canAsk() {
  return Boolean(stdin.isTTY && stdout.isTTY);
}

export function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function confirm(question) {
  const answer = await ask(`${question} (y/N) `);
  return answer.toLowerCase() === 'y';
}

/**
 * 비밀번호 입력. 화면에 글자가 남지 않게 한다.
 *
 * 입력하는 동안 아무 소리도 나지 않으면 "먹히고 있나" 싶으므로,
 * 물음표 문구에 화면에 표시되지 않는다는 것을 미리 알린다.
 */
export function askSecret(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    // 입력 글자를 그대로 되비추지 않는다. 물음표 자체는 보여야 하므로 그때만 통과시킨다.
    let muted = false;
    rl._writeToOutput = (chunk) => {
      if (!muted) stdout.write(chunk);
    };
    rl.question(question, (answer) => {
      muted = false;
      rl.close();
      stdout.write('\n');
      resolve(answer.trim());
    });
    muted = true;
  });
}

export function line(text = '') {
  console.log(text);
}

export function errorLine(text) {
  console.error(text);
}
