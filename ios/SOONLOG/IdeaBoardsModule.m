#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(IdeaBoardsModule, NSObject)
RCT_EXTERN_METHOD(getBoards:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
