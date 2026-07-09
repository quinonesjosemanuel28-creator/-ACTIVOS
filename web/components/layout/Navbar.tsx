'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { nav, contact } from '@/config/site';
import { Logo } from '@/components/ui/Logo';
import { cn } from '@/lib/utils';

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line-navy bg-navy/85 backdrop-blur-md">
      <nav
        className="container-site flex h-16 items-center justify-between"
        aria-label="Navegación principal"
      >
        <Link href="#top" aria-label="+Activos Holding — inicio">
          <Logo variant="dark" />
        </Link>

        {/* Enlaces — desktop (orden del mockup del manual) */}
        <ul className="hidden items-center gap-7 md:flex">
          {nav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="text-sm text-warm/80 transition-colors hover:text-gold-light"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* CTA — desktop */}
        <div className="hidden md:block">
          <a
            href={contact.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-gold px-4 py-2 text-sm font-bold text-navy-deep transition-colors hover:bg-gold-light"
          >
            WhatsApp
          </a>
        </div>

        {/* Botón menú — mobile */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-warm md:hidden"
          aria-expanded={open}
          aria-controls="menu-mobile"
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {/* Panel — mobile */}
      <div
        id="menu-mobile"
        className={cn(
          'overflow-hidden border-t border-line-navy bg-navy md:hidden',
          open ? 'block' : 'hidden',
        )}
      >
        <ul className="container-site flex flex-col gap-1 py-4">
          {nav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className="block rounded px-2 py-2.5 text-sm text-warm/85 hover:bg-white/5 hover:text-gold-light"
              >
                {item.label}
              </Link>
            </li>
          ))}
          <li className="mt-2 px-2">
            <a
              href={contact.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-md bg-gold px-4 py-2.5 text-center text-sm font-bold text-navy-deep"
            >
              WhatsApp
            </a>
          </li>
        </ul>
      </div>
    </header>
  );
}
