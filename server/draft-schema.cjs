'use strict';
// Request the exact structural contract; literal evidence is still validated locally.
module.exports=function draftSchema(context,grounded){
  const string={type:'string'};
  const object=properties=>({type:'object',properties,required:Object.keys(properties)});
  // Keep provider constraints compact; the local validator enforces collection limits.
  const array=items=>({type:'array',items});
  const evidence=array(object({chunkId:grounded?{type:'string',enum:context.map(c=>c.id)}:string,quote:string}));
  return object({
    title:string,
    nodes:array(object({id:string,name:string,group:string,fields:array(object({name:string,type:string,evidence})),evidence})),
    edges:array(object({from:string,to:string,label:string,evidence})),
    recommendations:array(object({text:string,evidence})),
    recommendedLanguages:array(object({name:string,reason:string,evidence})),
    limitations:string
  });
};
