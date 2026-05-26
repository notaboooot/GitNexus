// Person.m - Objective-C implementation file for testing
#import "Person.h"

@implementation Person

- (instancetype)initWithName:(NSString *)name age:(NSInteger)age {
    self = [super init];
    if (self) {
        _name = [name copy];
        _age = age;
    }
    return self;
}

- (void)introduce {
    NSLog(@"Hello, I'm %@, age %ld", self.name, (long)self.age);
}

- (NSString *)greeting {
    return [NSString stringWithFormat:@"Hi, I'm %@", self.name];
}

- (id)copyWithZone:(NSZone *)zone {
    Person *copy = [[Person alloc] initWithName:self.name age:self.age];
    return copy;
}

@end
