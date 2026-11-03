export function documentFileType(contentType: string) {
  if (contentType === "application/pdf")
    return { label: "PDF", tone: "text-red-300" };
  if (contentType.includes("wordprocessingml"))
    return { label: "DOCX", tone: "text-blue-300" };
  if (contentType.includes("spreadsheetml"))
    return { label: "XLSX", tone: "text-green-300" };
  if (contentType.includes("presentationml"))
    return { label: "PPTX", tone: "text-orange-300" };
  if (contentType === "text/csv")
    return { label: "CSV", tone: "text-teal-300" };
  if (contentType === "text/markdown")
    return { label: "MD", tone: "text-violet-300" };
  if (contentType.startsWith("image/"))
    return { label: "IMG", tone: "text-muted" };
  return { label: "TXT", tone: "text-slate-300" };
}
export function DocumentFileTypeIcon({ contentType }: { contentType: string }) {
  const { label, tone } = documentFileType(contentType);
  return (
    <span
      className={`relative flex size-12 shrink-0 items-center justify-center ${tone}`}
      aria-hidden="true"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 32 40"
        fill="none"
        className="h-10 w-8"
      >
        <path
          d="M5 1H21L31 11V36A3 3 0 0 1 28 39H5A3 3 0 0 1 2 36V4A3 3 0 0 1 5 1Z"
          fill="currentColor"
          fillOpacity=".12"
          stroke="currentColor"
          strokeWidth="1.25"
        />
        <path
          d="M21 1V8A3 3 0 0 0 24 11H31"
          fill="currentColor"
          fillOpacity=".2"
          stroke="currentColor"
          strokeWidth="1.25"
        />
      </svg>
      <span className="absolute bottom-2.5 text-[9px] leading-none font-semibold tracking-tight">
        {label}
      </span>
    </span>
  );
}
