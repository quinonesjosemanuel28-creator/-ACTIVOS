import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { accionesDe, type Rol, type UsuarioPublico } from '@domain/auth/permisos';
import { Sidebar, MobileNav, itemsVisibles } from '../components/Sidebar';
import { useUI, puedeUI, ACCION_POR_VISTA } from '../store';

const usuario = (rol: Rol): UsuarioPublico => ({
  id: 'u1',
  email: 'x@activos.com',
  nombre: 'Equis',
  rol,
  activo: true,
  debeCambiarPassword: false,
  creadoEn: '2026-01-01T00:00:00.000Z',
});

const sesion = (rol: Rol) => ({ usuario: usuario(rol), acciones: accionesDe(rol) });
const labels = (rol: Rol) => itemsVisibles(sesion(rol)).map((i) => i.label);

describe('UI · gating del menú por rol (itemsVisibles)', () => {
  it('sin sesión cargada muestra todo: el candado real es la API', () => {
    const todos = itemsVisibles({ usuario: null, acciones: [] }).map((i) => i.label);
    expect(todos).toContain('Carga & Admin');
    expect(todos).toContain('Usuarios');
    // y el render estático (estado inicial del store) coincide
    expect(renderToStaticMarkup(<Sidebar />)).toContain('Carga &amp; Admin');
    expect(renderToStaticMarkup(<MobileNav />)).toContain('Usuarios');
  });

  it('LECTOR: ve dashboards pero NO Carga & Admin ni Usuarios', () => {
    const l = labels('LECTOR');
    expect(l).toContain('Vista Ejecutiva');
    expect(l).toContain('Cobranza');
    expect(l).toContain('Asistente IA');
    expect(l).not.toContain('Carga & Admin');
    expect(l).not.toContain('Usuarios');
  });

  it('EDITOR: tampoco ve Carga & Admin ni Usuarios (importar/admin es solo ADMIN)', () => {
    const l = labels('EDITOR');
    expect(l).toContain('Cierres y Clientes');
    expect(l).toContain('Egresos');
    expect(l).not.toContain('Carga & Admin');
    expect(l).not.toContain('Usuarios');
  });

  it('ADMIN: ve todo, incluida la gestión de usuarios', () => {
    const l = labels('ADMIN');
    expect(l).toContain('Carga & Admin');
    expect(l).toContain('Usuarios');
    // ADMIN ve exactamente la lista completa
    expect(l).toEqual(itemsVisibles({ usuario: null, acciones: [] }).map((i) => i.label));
  });

  it('CONSULTOR: el menú del contable le queda VACÍO (todas las vistas exigen ver)', () => {
    expect(labels('CONSULTOR')).toEqual([]);
  });
});

describe('UI · matriz vista ↔ acción y helper puedeUI', () => {
  it('datos exige importar y usuarios exige gestionar_usuarios', () => {
    expect(ACCION_POR_VISTA.datos).toBe('importar');
    expect(ACCION_POR_VISTA.usuarios).toBe('gestionar_usuarios');
    // todas las demás vistas son de lectura
    const lecturas = Object.entries(ACCION_POR_VISTA).filter(([v]) => v !== 'datos' && v !== 'usuarios');
    expect(lecturas.every(([, a]) => a === 'ver')).toBe(true);
  });

  it('puedeUI respeta las acciones del rol', () => {
    expect(puedeUI(sesion('LECTOR'), 'ver')).toBe(true);
    expect(puedeUI(sesion('LECTOR'), 'editar')).toBe(false);
    expect(puedeUI(sesion('EDITOR'), 'editar')).toBe(true);
    expect(puedeUI(sesion('EDITOR'), 'importar')).toBe(false);
    expect(puedeUI(sesion('ADMIN'), 'gestionar_usuarios')).toBe(true);
    expect(puedeUI(sesion('CONSULTOR'), 'ver')).toBe(false);
    expect(puedeUI(sesion('CONSULTOR'), 'ver_alumnos')).toBe(true);
  });

  it('setSesion corrige la vista activa si quedó prohibida para el rol', () => {
    useUI.setState({ vista: 'datos' });
    useUI.getState().setSesion(usuario('EDITOR'), accionesDe('EDITOR'));
    expect(useUI.getState().vista).toBe('ejecutiva'); // datos es solo ADMIN

    useUI.setState({ vista: 'cobranza' });
    useUI.getState().setSesion(usuario('LECTOR'), accionesDe('LECTOR'));
    expect(useUI.getState().vista).toBe('cobranza'); // cobranza es de lectura: se queda

    useUI.setState({ usuario: null, acciones: [], vista: 'ejecutiva' }); // limpia para otros tests
  });
});
