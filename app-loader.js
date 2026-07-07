(async()=>{
  const files=['app.js','app-2.js','app-3.js','app-4.js','app-5.js','app-6.js'];
  const parts=[];
  for(const file of files){
    const response=await fetch(file);
    if(!response.ok) throw new Error('Gagal memuat '+file);
    parts.push(await response.text());
  }
  const blob=new Blob([parts.join('\n')],{type:'text/javascript'});
  const script=document.createElement('script');
  script.src=URL.createObjectURL(blob);
  document.head.appendChild(script);
})().catch(error=>console.error(error));
