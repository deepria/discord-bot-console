import neutral from "../assets/rio/rio-neutral.webp";
import expression1 from "../assets/rio/rio-expression-1.webp";
import expression2 from "../assets/rio/rio-expression-2.webp";
import expression3 from "../assets/rio/rio-expression-3.webp";
import expression4 from "../assets/rio/rio-expression-4.webp";
import expression5 from "../assets/rio/rio-expression-5.webp";
import expression6 from "../assets/rio/rio-expression-6.webp";
import expression7 from "../assets/rio/rio-expression-7.webp";
import expression8 from "../assets/rio/rio-expression-8.webp";
import expression9 from "../assets/rio/rio-expression-9.webp";
import expression99 from "../assets/rio/rio-expression-99.webp";

export interface RioDialogue {
  image: string;
  message: string;
  detail: string;
}

export const rioExpressions = [
  neutral,
  expression1,
  expression2,
  expression3,
  expression4,
  expression5,
  expression6,
  expression7,
  expression8,
  expression9,
  expression99,
] as const;

export const rioDialogues: readonly RioDialogue[] = [
  {
    image: expression1,
    message: "선생님, 관제 데이터는 제가 계속 확인하고 있어.",
    detail: "RIO / OPERATIONAL OVERSIGHT",
  },
  {
    image: expression2,
    message: "이 정도 변수는 이미 계산에 포함되어 있었어.",
    detail: "RIO / CALCULATION COMPLETE",
  },
  {
    image: expression3,
    message: "흐름이 안정됐어. 이제 조금은 안심해도 돼.",
    detail: "RIO / SYSTEM STABLE",
  },
  {
    image: expression4,
    message: "음… 이 수치는 다시 확인할 필요가 있겠네.",
    detail: "RIO / REVIEW REQUIRED",
  },
  {
    image: expression5,
    message: "새 이벤트를 발견했어. 해당 모니터에 표시해 둘게.",
    detail: "RIO / EVENT DETECTED",
  },
  {
    image: expression6,
    message: "서두를 필요는 없어. 순서대로 처리하면 돼.",
    detail: "RIO / PROCEDURE READY",
  },
  {
    image: expression7,
    message: "위험 신호는 놓치지 않을 거야. 나를 믿어.",
    detail: "RIO / ALERT WATCH",
  },
  {
    image: expression8,
    message: "선생님이 와 줘서 다행이야. 정말로.",
    detail: "RIO / LINK ESTABLISHED",
  },
  {
    image: expression9,
    message: "오늘 운영도 완벽하게 끝내 보자, 선생님.",
    detail: "RIO / COMMAND DECK READY",
  },
  {
    image: expression99,
    message: "잠깐 쉬어도 괜찮아. 그동안은 내가 지켜볼 테니까.",
    detail: "RIO / STANDING BY",
  },
];
