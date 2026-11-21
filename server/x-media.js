import {parseLink} from '../src/links.js';

const userAgent='Trama/1.0 (+https://github.com/FabioSilverio/trama-quadros)';
async function tweet(id,signal){
 const r=await fetch('https://api.fxtwitter.com/status/'+id,{signal,redirect:'error',headers:{'User-Agent':userAgent}});
 if(r.ok)return (await r.json()).tweet;
}
function attachments(post){
 const result=[];
 for(const source of [post,post?.quote]){
  const items=source?.media?.all||[...(source?.media?.photos||[]),...(source?.media?.videos||[])];
  for(const item of items){
   const photo=item.type==='photo';
   if(!photo&&!['video','gif','animated_gif'].includes(item.type))continue;
   const url=photo?item.url:(item.url?.includes('.mp4')?item.url:item.formats?.find(v=>v.container==='mp4'||v.url?.includes('.mp4'))?.url);
   if(!url||!/^https:\/\/(?:pbs|video)\.twimg\.com\//i.test(url)||result.some(m=>m.url===url))continue;
   result.push({type:photo?'photo':'video',url,poster:photo?url:item.thumbnail_url,alt:item.altText||item.alt_text||''});
  }
 }
 return result;
}
export async function xPreview(ref,linked){
 const signal=AbortSignal.timeout(4200);
 const post=await tweet(ref.id,signal);
 let media=attachments(post);
 if(!media.length){
  let id=post?.raw_text?.facets?.map(f=>parseLink(f.replacement)).find(r=>r?.kind==='x'&&r.id!==ref.id)?.id;
  // Older cards contain only the shortened address of a quoted public post.
  if(!id&&typeof linked==='string'&&/^https:\/\/t\.co\/[a-z0-9]+$/i.test(linked)){
   const r=await fetch(linked,{method:'HEAD',redirect:'manual',signal});
   const target=parseLink(r.headers.get('location'));if(target?.kind==='x')id=target.id;
  }
  if(id&&id!==ref.id)media=attachments(await tweet(id,signal));
 }
 if(!post&&!media.length)return null;
 return {title:post?.text,author:post?.author?.name,image:media[0]?.poster,media};
}
