import { Button, InlineAlert } from "@home-hub/ui-web";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { type CreatedGuestLink, guestLinkUrl } from "./link-api";

export function CreatedLink({
  created,
  dismiss,
}: {
  created: CreatedGuestLink;
  dismiss: () => void;
}) {
  const [qr, setQr] = useState<string>();
  const [message, setMessage] = useState("");
  const url = guestLinkUrl(created.credential);
  useEffect(() => {
    // Hide the surrounding application when printing; the card restores visibility.
    document.body.classList.add("print:invisible");
    return () => document.body.classList.remove("print:invisible");
  }, []);
  useEffect(() => {
    let active = true;
    setQr(undefined);
    void QRCode.toDataURL(url, {
      width: 320,
      margin: 4,
      errorCorrectionLevel: "M",
    })
      .then((image) => {
        if (active) setQr(image);
      })
      .catch(() => {
        if (active)
          setMessage(
            "Unable to generate the QR code. You can still copy the link.",
          );
      });
    return () => {
      active = false;
    };
  }, [url]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Link copied.");
    } catch {
      setMessage("Unable to copy. Select and copy the link below.");
    }
  }
  return (
    <section className="grid gap-4 rounded-xl border border-border bg-surface p-5">
      <InlineAlert>
        Save this link now. It cannot be displayed again after you leave this
        screen.
      </InlineAlert>
      <div className="grid justify-items-center gap-3 text-center print:visible print:absolute print:inset-0 print:bg-white print:p-8 print:text-black">
        <h4 className="text-lg font-semibold">{created.link.name}</h4>
        <p>
          {created.link.access === "read" ? "Read-only" : "Read and write"}{" "}
          Guest access · Expires{" "}
          {new Date(created.link.expiresAt).toLocaleString()}
        </p>
        {qr ? (
          <img
            src={qr}
            width={320}
            height={320}
            alt={`Guest access QR code for ${created.link.name}`}
            className="max-w-full rounded-lg bg-white"
          />
        ) : (
          <p>Preparing QR code…</p>
        )}
        <p className="max-w-full select-all break-all text-sm text-muted print:text-black">
          {url}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button onClick={() => void copy()}>Copy link</Button>
        <Button
          variant="secondary"
          disabled={!qr}
          onClick={() => window.print()}
        >
          Print QR
        </Button>
        {qr ? (
          <a
            className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium"
            href={qr}
            download={`guest-access-${created.link.id}.png`}
          >
            Download QR
          </a>
        ) : null}
        <Button variant="ghost" onClick={dismiss}>
          Done
        </Button>
      </div>
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </section>
  );
}
