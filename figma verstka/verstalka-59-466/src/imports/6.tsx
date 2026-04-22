import svgPaths from "./svg-3j385ce6jn";
import imgRectangle417 from "figma:asset/2a5de0fcb0af378ed417338bbd22e203f7882b88.png";
import imgRectangle371 from "figma:asset/bab38f82f0fe90ed712971e8444745a3a60eac8a.png";
import imgRectangle372 from "figma:asset/f81fc9a4d086593805ab1ac26a94e50a08454218.png";

function Frame() {
  return (
    <div className="flex-[1_0_0] min-h-px min-w-px relative rounded-[8px]">
      <div aria-hidden="true" className="absolute border border-[#f1f1f1] border-solid inset-0 pointer-events-none rounded-[8px]" />
      <div className="flex flex-col justify-center size-full">
        <div className="content-stretch flex flex-col items-start justify-center p-[10px] relative w-full">
          <p className="font-['Proxima_Nova:Regular',sans-serif] leading-[14px] not-italic relative shrink-0 text-[#212121] text-[13px] w-[428px]" style={{ fontFeatureSettings: "'pcap', 'salt'" }}>
            А самое приятное то, что государство помогает Вам создавать свой капитал.
          </p>
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
    <div className="absolute content-stretch flex flex-col font-['Proxima_Nova:Regular',sans-serif] gap-[8px] items-start leading-[14px] left-[50px] not-italic text-[14px] text-black top-[284px] w-[265px]">
      <p className="relative shrink-0 w-full">Софинансирование за 2026 г. - 36 000 ₽</p>
      <p className="relative shrink-0 w-full">Всего софинансирование - 342 751 ₽</p>
    </div>
  );
}

function Frame3() {
  return (
    <div className="absolute content-stretch flex flex-col gap-[8px] items-start leading-[14px] left-[50px] not-italic text-[14px] text-black top-[598px] w-[265px]">
      <p className="font-['Proxima_Nova:Semibold',sans-serif] relative shrink-0 whitespace-nowrap">Цель: Достойная пенсия - 100 000 ₽/мес.</p>
      <p className="font-['Proxima_Nova:Regular',sans-serif] min-w-full relative shrink-0 w-[min-content]">Дата - 2045 г.</p>
    </div>
  );
}

function Frame2() {
  return (
    <div className="absolute content-stretch flex flex-col font-['Proxima_Nova:Regular',sans-serif] gap-[8px] items-start justify-center leading-[14px] left-[50px] not-italic text-[14px] text-black top-[650px] w-[245px]">
      <p className="relative shrink-0 w-full">Первоначальный капитал - 50 000 ₽</p>
      <p className="relative shrink-0 w-full">Пополнение капитала - 4 500 ₽/мес.</p>
      <p className="relative shrink-0 w-full">Всего софинансирование - 360 000 ₽</p>
      <p className="relative shrink-0 w-full">Всего налоговых вычетов - 698 748 ₽</p>
    </div>
  );
}

function Frame5() {
  return (
    <div className="absolute content-stretch flex flex-col font-['Proxima_Nova:Regular',sans-serif] gap-[8px] items-start leading-[14px] left-[50px] not-italic text-[14px] text-black top-[476px] w-[326px]">
      <p className="min-w-full relative shrink-0 w-[min-content]">Налоговый вычет за 2026 г. - 11 900 ₽</p>
      <p className="relative shrink-0 whitespace-nowrap">Всего налоговых вычетов за весь срок - 698 748 ₽</p>
    </div>
  );
}

function Group() {
  return (
    <div className="absolute contents left-[30px] top-[422px]">
      <div className="-translate-x-1/2 absolute h-[110px] left-1/2 top-[422px] w-[535px]">
        <img alt="" className="absolute block max-w-none size-full" height="110" src={imgRectangle372} width="535" />
      </div>
      <p className="absolute font-['Proxima_Nova:Bold',sans-serif] leading-[14px] left-[calc(50%-109.5px)] not-italic text-[#722257] text-[16px] top-[442px] whitespace-nowrap">Налоговое планирование</p>
      <Frame5 />
    </div>
  );
}

function LogoBOld() {
  return (
    <div className="-translate-x-1/2 absolute h-[19px] left-[calc(50%-232.5px)] top-[811px] w-[70px]" data-name="logo-b_old 1">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 70 19">
        <g clipPath="url(#clip0_1_68)" id="logo-b_old 1">
          <path d={svgPaths.pddc4200} fill="var(--fill-0, #101820)" id="Vector" />
        </g>
        <defs>
          <clipPath id="clip0_1_68">
            <rect fill="white" height="19" width="70" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

export default function Component() {
  return (
    <div className="bg-white relative size-full" data-name="6">
      <Frame1 />
      <p className="absolute font-['Proxima_Nova:Regular',sans-serif] leading-[14px] left-[30px] not-italic text-[13px] text-black top-[110px] whitespace-nowrap">Ваш доход - 110 000 ₽/мес.</p>
      <p className="absolute font-['Proxima_Nova:Regular',sans-serif] leading-[14px] left-[30px] not-italic text-[13px] text-black top-[136px] w-[456px]">В соответствии с федеральным законом № 75-ФЗ «О негосударственных пенсионных фондах», государство обязуется добавлять ежегодно 50 коп. на каждый Ваш рубль, но не более 36 000 ₽ в год из расчета всех сумм пополнений в течение предыдущего года. И так на протяжении 10 лет.</p>
      <p className="absolute font-['Proxima_Nova:Regular',sans-serif] leading-[14px] left-[30px] not-italic text-[13px] text-black top-[360px] w-[499px] whitespace-pre-wrap">
        {`Но и это еще не все. Государство дает возможность получить налоговые вычеты. `}
        <br aria-hidden="true" />В соответствии со статьей НК РФ № 56 Вы имеете право получать возврат налогов на доходы физического лица.
      </p>
      <div className="-translate-x-1/2 absolute h-[110px] left-1/2 top-[230px] w-[535px]">
        <img alt="" className="absolute block max-w-none size-full" height="110" src={imgRectangle371} width="535" />
      </div>
      <p className="absolute font-['Proxima_Nova:Bold',sans-serif] leading-[14px] left-[calc(50%-109.5px)] not-italic text-[#722257] text-[16px] top-[250px] whitespace-nowrap">План по софинансированию</p>
      <div className="absolute bg-[#722257] h-[33px] left-[30px] rounded-tl-[8px] rounded-tr-[8px] top-[552px] w-[535px]" />
      <Frame4 />
      <p className="absolute font-['Proxima_Nova:Semibold',sans-serif] leading-[14px] left-[260px] not-italic text-[16px] text-white top-[562px] whitespace-nowrap">Резюме</p>
      <div className="absolute bg-[#f3f3f4] h-[205px] left-[30px] rounded-bl-[8px] rounded-br-[8px] top-[586px] w-[535px]" />
      <Frame3 />
      <Frame2 />
      <p className="absolute font-['Proxima_Nova:Bold',sans-serif] leading-[16px] left-[50px] not-italic text-[15px] text-black top-[755px] whitespace-nowrap">Прогноз по итоговому капиталу - 24 944 611 ₽</p>
      <Group />
      <div className="absolute h-0 left-[50px] top-[746px] w-[495px]">
        <div className="absolute inset-[-1px_0_0_0]">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 495 1">
            <line id="Line 23" stroke="var(--stroke-0, #722257)" x2="495" y1="0.5" y2="0.5" />
          </svg>
        </div>
      </div>
      <LogoBOld />
    </div>
  );
}