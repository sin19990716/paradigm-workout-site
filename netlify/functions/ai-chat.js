// netlify/functions/ai-chat.js

exports.handler = async (event, context) => {
  try {
    // CORS / preflight(옵션) 요청 처리 (브라우저 보호용)
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
        body: "",
      };
    }

    // ----- 1. 클라이언트에서 보낸 데이터 안전하게 파싱 -----
    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch (err) {
      console.error("JSON parse error:", err);
      body = {};
    }

    const message = body.message || "";
    const memberId = body.memberId || "";
    const members = Array.isArray(body.members) ? body.members : [];
    const sessions = Array.isArray(body.sessions) ? body.sessions : [];
    const inbody = Array.isArray(body.inbody) ? body.inbody : [];

    // 선택된 회원 찾기
    const member =
      members.find((m) => String(m.id) === String(memberId)) || null;

    // ----- 2. 간단한 "운동 분석 챗봇" 답변 만들기 -----

    // 기본 인사
    let replyLines = [];

    if (!message) {
      replyLines.push("안녕하세요, 패러다임짐 AI 운동 분석 챗봇입니다. 🙂");
      replyLines.push(
        "회원님 상태나 목표를 말씀해 주시면, 최근 운동 기록과 인바디를 함께 보면서 코멘트를 남겨드릴게요."
      );
    } else {
      // 사용자가 입력한 문장 그대로 먼저 보여주기
      replyLines.push(`질문: “${message}”`);
      replyLines.push("");
    }

    if (!member) {
      replyLines.push(
        "현재 선택된 회원 정보가 없습니다. 상단 1번에서 회원을 선택하신 뒤 다시 질문해 주세요."
      );
    } else {
      // ---- 2-1. 선택된 회원의 최근 운동 세션들 찾기 ----
      const memberSessions = sessions
        .filter((s) => String(s.memberId) === String(memberId))
        .sort((a, b) => b.timestamp - a.timestamp);

      if (memberSessions.length === 0) {
        replyLines.push(
          `현재 ${member.name} 회원님의 저장된 운동 기록이 없습니다. 첫 운동을 저장해 두면, 다음부터는 저는 기록을 바탕으로 피드백을 드릴 수 있어요.`
        );
      } else {
        const lastSession = memberSessions[0];
        const lastDate = new Date(lastSession.timestamp);
        const lastDateStr = `${lastDate.getFullYear()}-${String(
          lastDate.getMonth() + 1
        ).padStart(2, "0")}-${String(lastDate.getDate()).padStart(2, "0")}`;

        // 총 볼륨 / 세트 / 반복수 계산
        let totalSets = 0;
        let totalReps = 0;
        let totalVolume = 0;
        const partVolume = {}; // 부위별 볼륨

        lastSession.exercises.forEach((ex) => {
          ex.sets.forEach((s) => {
            const w = parseFloat(s.weight || "0") || 0;
            const r = parseFloat(s.reps || "0") || 0;
            totalSets += 1;
            totalReps += r;
            const vol = w * r;
            totalVolume += vol;
            partVolume[ex.bodyPart] = (partVolume[ex.bodyPart] || 0) + vol;
          });
        });

        // 부위별 정렬
        const partRank = Object.entries(partVolume)
          .map(([name, vol]) => ({ name, vol }))
          .sort((a, b) => b.vol - a.vol);

        replyLines.push(
          `📝 ${member.name} 회원님의 최근 운동일은 ${lastDateStr} 입니다.`
        );
        replyLines.push(
          `- 세트 수: ${totalSets}세트 / 총 반복수: ${totalReps}회 / 총 볼륨: 약 ${Math.round(
            totalVolume
          )} kg`
        );

        if (partRank.length > 0) {
          const top = partRank[0];
          replyLines.push(
            `- 가장 많이 한 부위는 “${top.name}”이며, 대략 ${Math.round(
              top.vol
            )} kg 정도의 볼륨이 쌓였습니다.`
          );
        }

        // 최근 3회 기록 요약
        const recent3 = memberSessions.slice(0, 3);
        replyLines.push("");
        replyLines.push("📅 최근 3회 운동 요약:");

        recent3.forEach((session, idx) => {
          const d = new Date(session.timestamp);
          const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
            2,
            "0"
          )}-${String(d.getDate()).padStart(2, "0")}`;

          // 세션별 볼륨
          let sessVol = 0;
          session.exercises.forEach((ex) => {
            ex.sets.forEach((s) => {
              const w = parseFloat(s.weight || "0") || 0;
              const r = parseFloat(s.reps || "0") || 0;
              sessVol += w * r;
            });
          });

          replyLines.push(
            `  ${idx + 1}) ${ds} / 운동종목 ${session.exercises.length}개 / 볼륨 약 ${Math.round(
              sessVol
            )} kg`
          );
        });
      }

      // ---- 2-2. 인바디 추이 간단 분석 ----
      const memberInbody = inbody
        .filter((r) => String(r.memberId) === String(memberId))
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

      if (memberInbody.length > 1) {
        const first = memberInbody[0];
        const last = memberInbody[memberInbody.length - 1];

        const w1 = parseFloat(first.weight || "0") || 0;
        const w2 = parseFloat(last.weight || "0") || 0;
        const m1 = parseFloat(first.muscle || "0") || 0;
        const m2 = parseFloat(last.muscle || "0") || 0;
        const f1 = parseFloat(first.fatPercent || "0") || 0;
        const f2 = parseFloat(last.fatPercent || "0") || 0;

        const dw = (w2 - w1).toFixed(1);
        const dm = (m2 - m1).toFixed(1);
        const df = (f2 - f1).toFixed(1);

        replyLines.push("");
        replyLines.push(
          `📊 인바디 변화 (${first.date} → ${last.date}) 기준으로 보면`
        );
        replyLines.push(
          `- 체중: ${w1.toFixed(1)} → ${w2.toFixed(
            1
          )} kg (${dw >= 0 ? "+" + dw : dw} kg)`
        );
        replyLines.push(
          `- 골격근량: ${m1.toFixed(1)} → ${m2.toFixed(
            1
          )} kg (${dm >= 0 ? "+" + dm : dm} kg)`
        );
        replyLines.push(
          `- 체지방률: ${f1.toFixed(1)} → ${f2.toFixed(
            1
          )} % (${df >= 0 ? "+" + df : df} %)`
        );

        // 아주 간단한 코멘트
        if (dm > 0 && df < 0) {
          replyLines.push(
            "→ 근육량은 늘고 체지방률은 감소하는 흐름이라 방향이 매우 좋습니다. 지금 패턴을 유지하면서 볼륨만 조금씩 올리는 전략이 좋아 보입니다. 💪"
          );
        } else if (dm < 0 && df > 0) {
          replyLines.push(
            "→ 근육량이 줄고 체지방률이 올라가는 추세라면, 최근 운동 강도나 빈도를 다시 점검해보는 게 좋겠습니다."
          );
        } else {
          replyLines.push(
            "→ 수치 변동이 크지 않으니, 앞으로 4~8주 정도 추이를 더 지켜보면서 운동 강도와 식단을 함께 조절해 보시면 좋겠습니다."
          );
        }
      } else {
        replyLines.push("");
        replyLines.push(
          "인바디 기록이 1개 이하라 추이 분석은 어렵습니다. 최소 2번 이상 인바디를 누적하면 변화 방향을 더 정확히 볼 수 있어요."
        );
      }
    }

    // ----- 3. 프론트엔드로 돌려보낼 결과 구성 -----
    const replyText = replyLines.join("\n");

    const responseBody = {
      text: replyText,
      // 나중에 여기 action을 추가하면 프론트에서 todayExercises 자동 추가도 가능
      // 예: action: { addExercises: [...], alert: "오늘 루틴에 반영했습니다." }
    };

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(responseBody),
    };
  } catch (err) {
    console.error("ai-chat 함수 내부 에러:", err);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        text:
          "서버 내부에서 오류가 발생했습니다. Netlify 함수 로그를 확인해 주세요.",
      }),
    };
  }
};
