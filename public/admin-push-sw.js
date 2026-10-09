// Notifications only: do not cache or intercept administrator pages or API responses.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json()||{};}catch{}
  event.waitUntil(self.registration.showNotification(data.title||'404 DREAMS / METRIC ALERT',{body:data.body||'NEW ACTIVITY. OPEN YOUR DASHBOARD.',icon:'/admin-icon-192.png',badge:'/favicon.svg',tag:data.tag||'dream-alert',data:{url:'/admin'}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const tab of tabs){if(new URL(tab.url).pathname.startsWith('/admin')){await tab.focus();return;}}await self.clients.openWindow('/admin');})());
});
