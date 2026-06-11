import Image from "next/image";
import Link from "next/link";
import { Camera, MessageCircle } from "lucide-react";

const nav = [
  ["Next Batch", "#next-batch"],
  ["Packs", "#packs"],
  ["Flavors", "#flavors"],
  ["How it works", "#how-it-works"],
  ["About", "#about"],
  ["FAQ", "#faq"],
];

export function Header() {
  return (
    <header className="site-header">
      <Link href="/" className="logo-link" aria-label="Bagelito.pe home">
        <Image src="/images/bagelito-logo.svg" alt="Bagelito.pe" width={757} height={253} priority />
      </Link>
      <nav aria-label="Main navigation">
        {nav.map(([label, href]) => (
          <a key={label} href={href}>{label}</a>
        ))}
      </nav>
      <div className="header-actions">
        <a className="pill-button pink" href="https://wa.me/51917547745" target="_blank" rel="noreferrer">
          <MessageCircle size={18} /> Join the waitlist
        </a>
        <a className="icon-button" href="https://www.instagram.com/bagelito.pe" target="_blank" rel="noreferrer" aria-label="Instagram">
          <Camera size={25} />
        </a>
      </div>
    </header>
  );
}
