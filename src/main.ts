import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

// meta CSP 無法設定 frame-ancestors，改由程式拒絕在 iframe 中執行，防止點擊劫持。
if (window.top !== window.self) {
  document.body.textContent = '基於安全考量，本工具不能在其他網頁中開啟。';
  throw new Error('拒絕在 iframe 中執行');
}

mount(App, { target: document.getElementById('app')! });
