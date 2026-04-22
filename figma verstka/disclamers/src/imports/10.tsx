import svgPaths from "./svg-c1ykbaulaj";

function Frame() {
  return (
    <div className="-translate-x-1/2 absolute content-stretch flex items-center left-1/2 px-[12px] py-[16px] rounded-bl-[8px] rounded-br-[8px] rounded-tr-[8px] top-[143px] w-[535px]">
      <div aria-hidden="true" className="absolute border border-[#722257] border-solid inset-0 pointer-events-none rounded-bl-[8px] rounded-br-[8px] rounded-tr-[8px]" />
      <div className="flex-[1_0_0] font-['Open_Sans:Regular',sans-serif] font-normal leading-[0] min-h-px min-w-px relative text-[#212121] text-[0px]" style={{ fontVariationSettings: "'wdth' 100", fontFeatureSettings: "'pcap', 'salt'" }}>
        <p className="font-['Proxima_Nova:Regular',sans-serif] mb-0 not-italic whitespace-pre-wrap">
          <span className="leading-[1.24] text-[14px]" style={{ fontFeatureSettings: "'pcap', 'salt'" }}>
            Суть риска:
          </span>
          <span className="leading-[1.24] text-[12px]" style={{ fontFeatureSettings: "'pcap', 'salt'" }}>
            <br aria-hidden="true" />
          </span>
          <span className="leading-[1.24] text-[12px]" style={{ fontFeatureSettings: "'pcap', 'salt'" }}>
            <br aria-hidden="true" />В финансовом плане учтен прогноз по инфляции, однако фактическая инфляция может оказаться выше или ниже запланированной. Это создает следующие риски:
            <br aria-hidden="true" />
            <br aria-hidden="true" />
          </span>
        </p>
        <ul className="font-['Proxima_Nova:Regular',sans-serif] leading-[1.24] list-disc mb-0 not-italic text-[12px]">
          <li className="mb-0 ms-[calc(var(--list-marker-font-size,0)*1.5*1)]">
            <span style={{ fontFeatureSettings: "'pcap', 'salt'" }}>Если инфляция выше ожидаемой:</span>
            <span style={{ fontFeatureSettings: "'pcap', 'salt'" }}>{` снижение реальной доходности инвестиций, уменьшение покупательной способности сбережений, рост расходов сверх запланированного бюджета.`}</span>
          </li>
          <li className="ms-[calc(var(--list-marker-font-size,0)*1.5*1)]">
            <span style={{ fontFeatureSettings: "'pcap', 'salt'" }}>Если инфляция ниже ожидаемой:</span>
            <span style={{ fontFeatureSettings: "'pcap', 'salt'" }}>
              {` возможное избыточное накопление ликвидности в одной цели и недофинансирование других целей.`}
              <br aria-hidden="true" />
              <br aria-hidden="true" />
            </span>
          </li>
        </ul>
        <p className="font-['Proxima_Nova:Regular',sans-serif] mb-0 not-italic whitespace-pre-wrap">
          <span className="leading-[1.24] text-[14px]" style={{ fontFeatureSettings: "'pcap', 'salt'" }}>
            Меры снижения риска:
          </span>
          <span className="leading-[1.24] text-[12px]" style={{ fontFeatureSettings: "'pcap', 'salt'" }}>
            <br aria-hidden="true" />
            <br aria-hidden="true" />
          </span>
        </p>
        <p className="font-['Proxima_Nova:Regular',sans-serif] leading-[1.24] mb-0 not-italic text-[12px] whitespace-pre-wrap" style={{ fontFeatureSettings: "'pcap', 'salt'" }}>
          Регулярный пересмотр финансового плана (раз в полгода) с корректировкой:
        </p>
        <ul className="list-disc">
          <li className="mb-0 ms-[calc(var(--list-marker-font-size,0)*1.5*1)]">
            <span className="font-['Proxima_Nova:Regular',sans-serif] leading-[1.24] not-italic text-[12px]" style={{ fontFeatureSettings: "'pcap', 'salt'" }}>
              Прогноза инфляции с учетом актуальных данных.
            </span>
          </li>
          <li className="mb-0 ms-[calc(var(--list-marker-font-size,0)*1.5*1)]">
            <span className="font-['Proxima_Nova:Regular',sans-serif] leading-[1.24] not-italic text-[12px]" style={{ fontFeatureSettings: "'pcap', 'salt'" }}>
              Стоимости цели.
            </span>
          </li>
          <li className="ms-[calc(var(--list-marker-font-size,0)*1.5*1)]">
            <span className="font-['Proxima_Nova:Regular',sans-serif] leading-[1.24] not-italic text-[12px]" style={{ fontFeatureSettings: "'pcap', 'salt'" }}>
              Индексации пополнения.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function Frame1() {
  return (
    <div className="absolute bg-[#722257] content-stretch flex items-center justify-center left-[30px] p-[12px] rounded-tl-[8px] rounded-tr-[8px] top-[100px]">
      <ol className="block font-['Proxima_Nova:Regular',sans-serif] leading-[0] not-italic relative shrink-0 text-[16px] text-white whitespace-nowrap" start="1">
        <li className="ms-[24px]">
          <span className="leading-[1.2]">Инфляционный риск</span>
        </li>
      </ol>
    </div>
  );
}

function LogoBOld() {
  return (
    <div className="-translate-x-1/2 absolute h-[19px] left-[calc(50%-232.5px)] top-[811px] w-[70px]" data-name="logo-b_old 2">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 70 19">
        <g clipPath="url(#clip0_1_22)" id="logo-b_old 2">
          <path d={svgPaths.pddc4200} fill="var(--fill-0, #101820)" id="Vector" />
        </g>
        <defs>
          <clipPath id="clip0_1_22">
            <rect fill="white" height="19" width="70" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

export default function Component() {
  return (
    <div className="bg-white relative size-full" data-name="10">
      <p className="absolute font-['Proxima_Nova:Regular',sans-serif] leading-[20px] left-[30px] not-italic text-[#212121] text-[18px] top-[30px] w-[368px]" style={{ fontFeatureSettings: "'pcap', 'salt'" }}>
        Декларация о рисках программы долгосрочных сбережений (ПДС)
      </p>
      <Frame />
      <Frame1 />
      <LogoBOld />
    </div>
  );
}