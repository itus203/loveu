// Bangladesh Standard Time helper (UTC+6)
// All timestamps stored as UTC (ISO), displayed as BST
function toBST(dateInput){
  if(!dateInput) return null;
  const d = new Date(dateInput);
  // BST is UTC+6, no DST
  const utc = d.getTime() + (d.getTimezoneOffset()*60000);
  const bst = new Date(utc + (6*3600000));
  return bst;
}
function formatBST(dateInput, opts={}){
  const bst = toBST(dateInput);
  if(!bst) return '';
  // Return ISO-like with BST offset
  // Use Intl to format
  return new Intl.DateTimeFormat('en-BD', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true,
    ...opts
  }).format(new Date(dateInput));
}
function nowBST(){
  return new Date(new Date().toLocaleString('en-US', {timeZone: 'Asia/Dhaka'}));
}
function nowBSTISOString(){
  // Return BST time as ISO string with +06:00
  const now = new Date();
  const bstStr = now.toLocaleString('en-US', {timeZone: 'Asia/Dhaka'});
  const bstDate = new Date(bstStr);
  // Format as YYYY-MM-DDTHH:mm:ss+06:00
  const pad=n=>String(n).padStart(2,'0');
  return `${bstDate.getFullYear()}-${pad(bstDate.getMonth()+1)}-${pad(bstDate.getDate())}T${pad(bstDate.getHours())}:${pad(bstDate.getMinutes())}:${pad(bstDate.getSeconds())}+06:00`;
}
function relativeTimeBST(dateInput){
  const now = new Date(new Date().toLocaleString('en-US', {timeZone: 'Asia/Dhaka'}));
  const past = new Date(new Date(dateInput).toLocaleString('en-US', {timeZone: 'Asia/Dhaka'}));
  const diffMs = now - past;
  const sec = Math.floor(diffMs/1000);
  if(sec < 5) return 'Just now';
  if(sec < 60) return `${sec} seconds ago`;
  const min = Math.floor(sec/60);
  if(min < 60) return `${min} minute${min>1?'s':''} ago`;
  const hr = Math.floor(min/60);
  if(hr < 24) return `${hr} hour${hr>1?'s':''} ago`;
  const days = Math.floor(hr/24);
  if(days===1) return 'Yesterday';
  if(days < 7) return `${days} days ago`;
  return formatBST(dateInput);
}
module.exports = { toBST, formatBST, nowBST, nowBSTISOString, relativeTimeBST };
