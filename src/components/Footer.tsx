import Image from "next/image";
import Link from "next/link";
import { Camera, MessageCircle } from "lucide-react";

export function Footer() {
  return (
    <footer className="site-footer">
      <Link href="/" className="footer-logo" aria-label="Bagelito.pe home">
        <Image src="/images/bagelito-logo.svg" alt="Bagelito.pe" width={757} height={253} />
      </Link>
      <p>The monthly bagel drop in Lima. Baked by batch. Made with attitude.</p>
      <a href="https://wa.me/51917547745" target="_blank" rel="noreferrer"><MessageCircle size={21} /> +51 917 547 745</a>
      <a href="https://www.instagram.com/bagelito.pe" target="_blank" rel="noreferrer"><Camera size={21} /> @bagelito.pe</a>
      <span>Made in Lima with <strong>love</strong></span>
    </footer>
  );
}
