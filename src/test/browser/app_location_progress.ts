// Substituted only for App's exact progress_connection import in the fixture Vite profile.
// No WebSocket object, socket transport, timer, backend or discovery operation exists here.
export function connectProgress(onMessage:(event:MessageEvent)=>void,onState:(state:'CONNECTING'|'CONNECTED'|'RECONNECTING')=>void){
 const fixture=(window as any).__appTransport;
 const subscription={id:++fixture.subscriptionId,active:true,unsubscribed:0,onMessage,onState};
 fixture.subscriptions.push(subscription);
 onState('CONNECTING');
 return ()=>{if(!subscription.active){fixture.violations.push('duplicate-unsubscribe');return;}
   subscription.active=false;subscription.unsubscribed++;
 };
}
