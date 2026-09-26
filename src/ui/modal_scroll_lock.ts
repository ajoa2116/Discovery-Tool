let count=0,previous='';
/** Shared ownership prevents nested dialogs/focus hooks restoring overflow too early. */
export function lockModalScroll(){
 if(count++===0){previous=document.body.style.overflow;document.body.style.overflow='hidden';}
 let released=false;
 return()=>{if(released)return;released=true;if(--count===0)document.body.style.overflow=previous;};
}
