// Person.h - Objective-C header file for testing
#import <Foundation/Foundation.h>

@protocol PersonDelegate <NSObject>
- (void)personDidUpdateName:(NSString *)name;
@end

@interface Person : NSObject <NSCopying>

@property (nonatomic, copy) NSString *name;
@property (nonatomic, assign) NSInteger age;
@property (nonatomic, weak) id<PersonDelegate> delegate;

- (instancetype)initWithName:(NSString *)name age:(NSInteger)age;
- (void)introduce;
- (NSString *)greeting;

@end
