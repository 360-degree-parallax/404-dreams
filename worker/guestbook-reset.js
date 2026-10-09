// Owner-requested reset: only the exact posts present on 2026-10-09 are removed.
const oldPosts=["08e73fb3-4009-4a27-adc7-75cd13a6442d","307e3457-19aa-4699-a241-27b5728fe30b"];
let complete=false;
export async function resetOldGuestbook(env){
  if(complete||!oldPosts.length)return;
  const rows=await env.DB.batch(oldPosts.map(id=>env.DB.prepare('SELECT id,image_key FROM guestbook WHERE id=?').bind(id)));
  for(const result of rows)for(const post of result.results||[]){await env.MEDIA.delete(post.image_key);await env.DB.batch([env.DB.prepare('DELETE FROM guestbook_likes WHERE post_id=?').bind(post.id),env.DB.prepare('DELETE FROM guestbook WHERE id=?').bind(post.id)]);}
  complete=true;
}
