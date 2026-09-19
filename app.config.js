module.exports=({config})=>{
  const appleLoginEnabled=process.env.EXPO_PUBLIC_APPLE_LOGIN_ENABLED==='true';
  return {
    ...config,
    ios:{...config.ios,usesAppleSignIn:appleLoginEnabled},
    extra:{...config.extra,appleLoginEnabled},
  };
};
