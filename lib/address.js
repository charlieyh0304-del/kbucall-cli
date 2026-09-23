/**
 * 주소 확정.
 *
 * 복지콜 앱 화면이 접수 전에 하는 확인을 그대로 옮긴 것이다. 잘못된 좌표로 접수되면
 * 사용자가 엉뚱한 곳에서 차를 기다린다. 실제로 일어난 적이 있다(2026-05-20).
 */

import { resolvePlace } from './api.js';
import { ask, canAsk, line } from './prompt.js';

export class AddressError extends Error {}

/**
 * @param label 사용자에게 읽어줄 이름. "출발지" 등
 * @param query 사용자가 입력한 문자열
 * @param token 반드시 필요하다. 없으면 카카오 키워드 검색으로 떨어져 지번을 못 찾는다
 * @param opts.autoYes 확인 없이 진행하라는 요청. 후보가 여럿이면 그래도 멈춘다
 */
export async function resolveAddress(label, query, token, opts = {}) {
  const out = await resolvePlace(query, token);

  if (!out.results || out.results.length === 0) {
    throw new AddressError(`${label} "${query}" 주소를 찾을 수 없습니다. 더 구체적으로 입력해주세요.`);
  }

  let chosen = out.results[0];

  if (out.ambiguous && Array.isArray(out.candidates) && out.candidates.length > 0) {
    line(`${label} "${query}" 이(가) 여러 곳에서 검색되었습니다. ${out.candidates.length}개 중에서 고르세요.`);
    out.candidates.forEach((c, i) => {
      const jibun = c.jibun && c.jibun !== c.address ? ` (지번 ${c.jibun})` : '';
      line(`${i + 1}. ${c.address}${jibun}`);
    });

    // 사람이 고를 수 없으면 접수하지 않는다. 임의로 첫 후보를 고르면
    // 같은 동 이름이 있는 다른 지역으로 차가 간다. --yes로도 건너뛸 수 없다.
    if (!canAsk()) {
      throw new AddressError(
        `${label} 후보가 여러 개인데 고를 수 없는 환경입니다. `
        + '위 후보 중 하나를 사용자에게 고르게 한 뒤 그 주소를 그대로 넘겨 다시 실행하세요.',
      );
    }

    const answer = await ask(`${label} 번호를 입력하세요: `);
    const idx = Number(answer) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= out.candidates.length) {
      throw new AddressError('번호를 잘못 입력했습니다.');
    }
    chosen = out.candidates[idx];
  }

  // 번지가 없으면 접수하지 않는다. 복지콜 콜센터가 사용자에게 전화해서 위치를
  // 다시 확인하게 된다. 복지콜 앱 화면도 같은 이유로 이 경우 접수를 막는다.
  if (out.hasAddressNumber === false) {
    throw new AddressError(
      `${label} "${chosen.address}" 에 번지가 확인되지 않았습니다. `
      + '번지를 포함해 다시 입력해주세요. 예: "구로구 오류동 126-1"',
    );
  }

  const jibun = chosen.jibun && chosen.jibun !== chosen.address ? ` (지번 ${chosen.jibun})` : '';
  line(`${label} 확정: ${chosen.address}${jibun}`);
  return chosen.address;
}
