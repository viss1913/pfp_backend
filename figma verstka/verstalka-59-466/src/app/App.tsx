import svgPaths from "../imports/svg-3j385ce6jn";
import imgAvatar from "figma:asset/2a5de0fcb0af378ed417338bbd22e203f7882b88.png";

export default function App() {
  // Данные для замены на переменные
  const data = {
    income: "110 000",
    cofinancing2026: "36 000",
    cofinancingTotal: "342 751",
    taxDeduction2026: "11 900",
    taxDeductionTotal: "698 748",
    goal: "Достойная пенсия - 100 000",
    goalDate: "2045 г.",
    initialCapital: "50 000",
    monthlyContribution: "4 500",
    cofinancingTotalResume: "360 000",
    taxDeductionTotalResume: "698 748",
    finalCapital: "24 944 611"
  };

  return (
    <div className="min-h-screen bg-[#e8e8e8] flex items-center justify-center p-8">
      {/* PDF страница A4 портрет: 595x842 px */}
      <div className="relative bg-white w-[595px] h-[842px] shadow-lg">
        {/* Блок с аватаром и фразой */}
        <div className="absolute left-[30px] top-[30px] flex gap-[10px] items-start w-[535px]">
          {/* Аватар */}
          <div className="relative w-[60px] h-[68px] shrink-0 rounded-[8px] overflow-hidden">
            <div
              className="absolute inset-0 rounded-[8px]"
              style={{
                backgroundImage: "linear-gradient(152.116deg, rgb(252, 237, 242) 0%, rgb(229, 239, 248) 120.41%)"
              }}
            />
            <img
              src={imgAvatar}
              alt="Avatar"
              className="absolute inset-0 w-full h-full object-cover rounded-[8px]"
            />
          </div>

          {/* Фраза в рамке */}
          <div className="flex-1 border border-[#f1f1f1] rounded-[8px] p-[10px]">
            <p className="text-[13px] leading-[14px] text-[#212121]">
              А самое приятное то, что государство помогает Вам создавать свой капитал.
            </p>
          </div>
        </div>

        {/* Строка "Ваш доход" */}
        <p className="absolute left-[30px] top-[110px] text-[13px] leading-[14px] text-black">
          Ваш доход - {data.income} ₽/мес.
        </p>

        {/* Абзац про софинансирование */}
        <p className="absolute left-[30px] top-[136px] w-[456px] text-[13px] leading-[14px] text-black">
          В соответствии с федеральным законом № 75-ФЗ «О негосударственных пенсионных фондах», государство обязуется добавлять ежегодно 50 коп. на каждый Ваш рубль, но не более 36 000 ₽ в год из расчета всех сумм пополнений в течение предыдущего года. И так на протяжении 10 лет.
        </p>

        {/* Карточка "План по софинансированию" */}
        <div className="absolute left-[30px] top-[230px] w-[535px]">
          {/* Фон карточки */}
          <div className="bg-[#f3f3f4] rounded-[8px] h-[110px]" />

          {/* Заголовок */}
          <p className="absolute left-[calc(50%-109.5px)] top-[20px] text-[16px] leading-[14px] font-bold text-[#722257]">
            План по софинансированию
          </p>

          {/* Данные */}
          <div className="absolute left-[20px] top-[54px] flex flex-col gap-[8px] text-[14px] leading-[14px] text-black">
            <p>Софинансирование за 2026 г. - {data.cofinancing2026} ₽</p>
            <p>Всего софинансирование - {data.cofinancingTotal} ₽</p>
          </div>
        </div>

        {/* Абзац про налоговые вычеты */}
        <p className="absolute left-[30px] top-[360px] w-[499px] text-[13px] leading-[14px] text-black">
          Но и это еще не все. Государство дает возможность получить налоговые вычеты.{' '}
          <br />
          В соответствии со статьей НК РФ № 56 Вы имеете право получать возврат налогов на доходы физического лица.
        </p>

        {/* Карточка "Налоговое планирование" */}
        <div className="absolute left-[30px] top-[422px] w-[535px]">
          {/* Фон карточки */}
          <div className="bg-[#f3f3f4] rounded-[8px] h-[110px]" />

          {/* Заголовок */}
          <p className="absolute left-[calc(50%-109.5px)] top-[20px] text-[16px] leading-[14px] font-bold text-[#722257]">
            Налоговое планирование
          </p>

          {/* Данные */}
          <div className="absolute left-[20px] top-[54px] flex flex-col gap-[8px] text-[14px] leading-[14px] text-black">
            <p>Налоговый вычет за 2026 г. - {data.taxDeduction2026} ₽</p>
            <p>Всего налоговых вычетов за весь срок - {data.taxDeductionTotal} ₽</p>
          </div>
        </div>

        {/* Карточка "Резюме" */}
        <div className="absolute left-[30px] top-[552px] w-[535px]">
          {/* Фиолетовая шапка */}
          <div className="bg-[#722257] rounded-t-[8px] h-[33px] flex items-center justify-center">
            <p className="text-[16px] leading-[14px] font-semibold text-white">
              Резюме
            </p>
          </div>

          {/* Светлый фон */}
          <div className="bg-[#f3f3f4] rounded-b-[8px] h-[205px] pt-[12px] px-[20px] pb-[20px]">
            {/* Параметры */}
            <div className="flex flex-col gap-[8px] text-[14px] leading-[14px] text-black">
              <p className="font-semibold">Цель: {data.goal} ₽/мес.</p>
              <p>Дата - {data.goalDate}</p>
              <p>Первоначальный капитал - {data.initialCapital} ₽</p>
              <p>Пополнение капитала - {data.monthlyContribution} ₽/мес.</p>
              <p>Всего софинансирование - {data.cofinancingTotalResume} ₽</p>
              <p>Всего налоговых вычетов - {data.taxDeductionTotalResume} ₽</p>
            </div>

            {/* Разделитель */}
            <div className="w-[495px] h-[1px] bg-[#722257] mt-[12px] mb-[12px]" />

            {/* Итоговая жирная строка */}
            <p className="text-[15px] leading-[16px] font-bold text-black">
              Прогноз по итоговому капиталу - {data.finalCapital} ₽
            </p>
          </div>
        </div>

        {/* Логотип внизу */}
        <div className="absolute left-[30px] bottom-[12px] w-[70px] h-[19px]">
          <svg className="w-full h-full" fill="none" viewBox="0 0 70 19">
            <g clipPath="url(#clip0_1_68)">
              <path d={svgPaths.pddc4200} fill="#101820" />
            </g>
            <defs>
              <clipPath id="clip0_1_68">
                <rect fill="white" height="19" width="70" />
              </clipPath>
            </defs>
          </svg>
        </div>
      </div>
    </div>
  );
}
