import svgPaths from "./svg-auzmirmz20";
import imgRectangle417 from "figma:asset/2a5de0fcb0af378ed417338bbd22e203f7882b88.png";
import imgRectangle582 from "figma:asset/392ee9312be61c574e2d6cc56e7aa69053471a60.png";

function Frame3() {
  return (
    <div className="content-stretch flex gap-[16px] items-start relative shrink-0">
      <div className="h-[70px] relative rounded-[8px] shrink-0 w-[120px]">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[8px] size-full" src={imgRectangle582} />
      </div>
      <p className="font-['Proxima_Nova:Regular',sans-serif] leading-[14px] not-italic relative shrink-0 text-[#212121] text-[13px] w-[304px]" style={{ fontFeatureSettings: "'pcap', 'salt'" }}>
        Иван, здесь я подробно описываю методику расчета Вашей будущей Госпенсии.
      </p>
    </div>
  );
}

function Frame2() {
  return (
    <div className="content-stretch flex flex-col gap-[12px] items-start relative shrink-0">
      <p className="font-['Proxima_Nova:Regular',sans-serif] leading-[14px] not-italic relative shrink-0 text-[#212121] text-[13px] whitespace-nowrap" style={{ fontFeatureSettings: "'pcap', 'salt'" }}>
        Достойная пенсия
      </p>
      <Frame3 />
    </div>
  );
}

function Frame() {
  return (
    <div className="flex-[1_0_0] min-h-px min-w-px relative rounded-[8px]">
      <div aria-hidden="true" className="absolute border border-[#f1f1f1] border-solid inset-0 pointer-events-none rounded-[8px]" />
      <div className="flex flex-col justify-center size-full">
        <div className="content-stretch flex flex-col items-start justify-center p-[10px] relative w-full">
          <Frame2 />
        </div>
      </div>
    </div>
  );
}

function Frame1() {
  return (
    <div className="absolute content-stretch flex gap-[10px] items-start left-[30px] top-[30px] w-[535px]">
      <div className="h-[68px] relative shrink-0 w-[60px]">
        <div className="absolute inset-0 rounded-[8px]">
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none rounded-[8px]">
            <div className="absolute inset-0 rounded-[8px]" style={{ backgroundImage: "linear-gradient(152.116deg, rgb(252, 237, 242) 0%, rgb(229, 239, 248) 120.41%)" }} />
            <img alt="" className="absolute max-w-none object-cover rounded-[8px] size-full" src={imgRectangle417} />
          </div>
        </div>
      </div>
      <Frame />
    </div>
  );
}

function Frame4() {
  return (
    <div className="absolute bg-[#722257] content-stretch flex items-center justify-center left-[30px] p-[10px] rounded-[8px] top-[214px]">
      <p className="font-['Proxima_Nova:Regular',sans-serif] leading-[13px] not-italic relative shrink-0 text-[14px] text-white whitespace-nowrap">Госпенсия = Фиксированная выплата + (ИПК × стоимость ИПК)</p>
    </div>
  );
}

function Frame5() {
  return (
    <div className="absolute bg-[#722257] content-stretch flex items-center justify-center left-[30px] p-[10px] rounded-[8px] top-[561px]">
      <p className="font-['Proxima_Nova:Regular',sans-serif] leading-[13px] not-italic relative shrink-0 text-[14px] text-white whitespace-nowrap">Ваша Госпенсия = 37 423 ₽ + (169 ИПК × 612 ₽) = 141 033 ₽/мес.</p>
    </div>
  );
}

function Frame8() {
  return (
    <div className="absolute content-stretch flex flex-col gap-[4px] items-center left-[130px] top-[693px] w-[65px]">
      <div className="bg-black h-[61px] rounded-tl-[4px] rounded-tr-[4px] shrink-0 w-[49px]" />
      <p className="font-['Proxima_Nova:Regular',sans-serif] leading-[13px] min-w-full not-italic relative shrink-0 text-[#212121] text-[12px] text-center w-[min-content]">Желаемая пенсия</p>
    </div>
  );
}

function Frame7() {
  return (
    <div className="-translate-x-1/2 absolute content-stretch flex flex-col gap-[4px] items-center left-[calc(50%-9.5px)] top-[733px] w-[62px]">
      <div className="bg-[#722257] h-[21px] rounded-tl-[4px] rounded-tr-[4px] shrink-0 w-[49px]" />
      <p className="font-['Proxima_Nova:Regular',sans-serif] leading-[13px] min-w-full not-italic relative shrink-0 text-[#212121] text-[12px] text-center w-[min-content]">Прогноз Госпенсии</p>
    </div>
  );
}

function Frame6() {
  return (
    <div className="absolute content-stretch flex flex-col gap-[4px] items-center left-[355px] top-[711px] w-[130px]">
      <div className="bg-[#8f8f8c] h-[43px] rounded-tl-[4px] rounded-tr-[4px] shrink-0 w-[49px]" />
      <p className="font-['Proxima_Nova:Regular',sans-serif] leading-[13px] min-w-full not-italic relative shrink-0 text-[#212121] text-[12px] text-center w-[min-content]">Необходимый дополнительный доход</p>
    </div>
  );
}

function Group() {
  return (
    <div className="absolute contents left-[30px] top-[659px]">
      <p className="-translate-x-1/2 absolute font-['Proxima_Nova:Regular',sans-serif] leading-[13px] left-[287px] not-italic text-[#212121] text-[12px] text-center top-[710px] whitespace-nowrap">36 117 ₽/мес.</p>
      <p className="-translate-x-1/2 absolute font-['Proxima_Nova:Regular',sans-serif] leading-[13px] left-[420.5px] not-italic text-[#212121] text-[12px] text-center top-[688px] whitespace-nowrap">63 883 ₽/мес.</p>
      <p className="-translate-x-1/2 absolute font-['Proxima_Nova:Regular',sans-serif] leading-[12px] left-[163.5px] not-italic text-[#212121] text-[12px] text-center top-[671px] whitespace-nowrap" style={{ fontFeatureSettings: "'pcap', 'salt'" }}>
        100 000 ₽/мес.
      </p>
      <div className="absolute h-[137px] left-[30px] top-[659px] w-[535px]">
        <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 535 137">
          <path d={svgPaths.p128df100} id="Rectangle 583" stroke="var(--stroke-0, #722257)" />
        </svg>
      </div>
      <Frame8 />
      <Frame7 />
      <Frame6 />
    </div>
  );
}

function LogoBOld() {
  return (
    <div className="-translate-x-1/2 absolute h-[19px] left-[calc(50%-232.5px)] top-[811px] w-[70px]" data-name="logo-b_old 1">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 70 19">
        <g clipPath="url(#clip0_1_55)" id="logo-b_old 1">
          <path d={svgPaths.pddc4200} fill="var(--fill-0, #101820)" id="Vector" />
        </g>
        <defs>
          <clipPath id="clip0_1_55">
            <rect fill="white" height="19" width="70" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

export default function Component() {
  return (
    <div className="bg-white relative size-full" data-name="7">
      <Frame1 />
      <p className="absolute font-['Proxima_Nova:Semibold',sans-serif] leading-[14px] left-[30px] not-italic text-[13px] text-black top-[166px] whitespace-nowrap">Прогноз Госпенсии</p>
      <p className="absolute font-['Proxima_Nova:Regular',sans-serif] leading-[14px] left-[30px] not-italic text-[#212121] text-[13px] top-[188px] whitespace-nowrap" style={{ fontFeatureSettings: "'pcap', 'salt'" }}>
        Как рассчитывается Госпенсия?
      </p>
      <Frame4 />
      <div className="absolute font-['Proxima_Nova:Regular',sans-serif] leading-[0] left-[calc(50%-267.5px)] not-italic text-[#212121] text-[13px] top-[259px] w-[535px]" style={{ fontFeatureSettings: "'pcap', 'salt'" }}>
        <p className="leading-[14px] mb-[3px] whitespace-pre-wrap">
          1. Фиксированная выплата
          <br aria-hidden="true" />
          <br aria-hidden="true" />
          Фиксированная выплата составляет 9 584 ₽ в месяц. Каждый год ее индексируют с учетом инфляции. Если инфляция будет в среднем 5,6% в год, то через 20 лет эта часть Госпенсии вырастет до 37 423 ₽/мес.
        </p>
        <p className="leading-[14px] mb-[3px] whitespace-pre-wrap">&nbsp;</p>
        <p className="leading-[14px] mb-[3px] whitespace-pre-wrap">
          2. Индивидуальный Пенсионный Коэффициент (ИПК)
          <br aria-hidden="true" />
          <br aria-hidden="true" />
          Вам начисляется каждый год определенное количество ИПК за взносы Вашего работодателя в Социальный Фонд России.
          <br aria-hidden="true" />
          <br aria-hidden="true" />
          Чем больше стаж и зарплата — тем больше накопите ИПК.
        </p>
        <ul className="list-disc mb-[3px]">
          <li className="mb-0 ms-[19.5px]">
            <span className="leading-[14px]">При Вашей зарплате 110 000 ₽/мес. за год начисляется ~4,4 ИПК.</span>
          </li>
          <li className="ms-[19.5px]">
            <span className="leading-[14px]">К пенсии у Вас может накопиться 169 ИПК.</span>
          </li>
        </ul>
        <p className="leading-[14px] whitespace-pre-wrap">
          Сколько стоит ИПК?
          <br aria-hidden="true" />
          Стоимость ИПК государство индексирует на величину инфляции.
          <br aria-hidden="true" />
          Стоимость одного ИПК в 2026 году — 156 рублей 76 копеек.
          <br aria-hidden="true" />
          Если инфляция 5,6% в год, то через 20 лет 1 балл = 612,12 ₽.
        </p>
      </div>
      <p className="absolute font-['Proxima_Nova:Regular',sans-serif] leading-[14px] left-[30px] not-italic text-[#212121] text-[13px] top-[535px] whitespace-nowrap" style={{ fontFeatureSettings: "'pcap', 'salt'" }}>
        Таким образом прогноз Вашей Госпенсии выглядит вот так:
      </p>
      <p className="absolute font-['Proxima_Nova:Regular',sans-serif] leading-[14px] left-[30px] not-italic text-[#212121] text-[13px] top-[606px] w-[535px] whitespace-pre-wrap" style={{ fontFeatureSettings: "'pcap', 'salt'" }}>
        {`Но! Из-за инфляции 141 033 ₽ через 25 лет — это как ~36 117 ₽ сегодня, а Ваша цель - `}
        <br aria-hidden="true" />
        {`100 000 ₽. Таким образом нам нужно создать дополнительный доход в размере `}
        <br aria-hidden="true" />
        63 883 ₽/мес.
      </p>
      <Frame5 />
      <Group />
      <LogoBOld />
    </div>
  );
}