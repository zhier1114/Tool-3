import { mount } from 'svelte';
import App from './App.svelte';
import { AppController } from './app/controller.svelte';
import './app.css';

// meta CSP 無法設定 frame-ancestors，改由程式拒絕在 iframe 中執行，防止點擊劫持。
if (window.top !== window.self) {
  document.body.textContent = '基於安全考量，本工具不能在其他網頁中開啟。';
  throw new Error('拒絕在 iframe 中執行');
}

const params = new URLSearchParams(location.search);
const target = document.getElementById('app')!;

// 展示模式只存在於開發建置；正式建置時這段會被整個移除。
const demo = import.meta.env.DEV && params.has('demo');
const app = demo ? new AppController((await import('./app/demo')).demoDeps()) : new AppController();
if (demo) Object.assign(window, { __demoApp: app });
mount(App, { target, props: { app } });
