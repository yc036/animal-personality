export const assetUrl=(path:string)=>`${import.meta.env.BASE_URL}${path.replace(/^\//,'')}`;
export const homeUrl=()=>`${import.meta.env.BASE_URL}#/`;
export const resultUrl=(id:string)=>`${location.origin}${import.meta.env.BASE_URL}#/result/${encodeURIComponent(id)}`;
