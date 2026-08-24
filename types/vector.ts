export type SemanticMatch={id:string;score:number;metadata:Record<string,unknown>}
export type SemanticSearchRequest={query:string;limit?:number;filters?:Record<string,unknown>}