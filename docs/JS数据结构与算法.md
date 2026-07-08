# JS数据结构与算法

## 一.常见数据结构

数组，栈，链表，图，散列表，队列，堆，树

### 1.数组

#### (1).push

在整个数组末尾新增一个push的数

```javascript
let arr=[1,2,3];
arr.push(4);  //结果：[1,2,3,4]
```

#### (2).pop

把末尾元素进行弹出

```javascript
let arr=[1,2,3,4];
arr.pop(); //结果：[1,2,3]
```

#### (3).shift与unshift

shift是从数组前面删除一个数，unshift是从前面插入一个数

#### (4).splice

基础语法：

```javascript
splice(n,m,k);
```

从数组的索引为n的位置删除m个数，k表示在这些删除位置增加的数

#### (5).sort

数组自带排序方法

```javascript
let arr=[1,5,3,7,4,9,2];
arr.sort((x,y)=>x-y); //大于0就交换顺序，小于0不交换顺序
console.log(arr);//结果：[1,2,3,4,5,7,9]
```

#### (6).concat

链接数组

```javascript
let arr1=[1,2,3];
let arr2=[4,5,6];
arr1.concat(arr2,7,8,9);//结果：[1,2,3,4,5,6,7,8,9]
```

#### (7).迭代方法

every,some,filter,map,foreach,reduce

##### (1.every

数组里面每一个数都符合条件才返回true

```javascript
let arr1=[1,2,3];
arr1.every(item=>item>0);
let res=console.log(res);//结果：true
```

##### (2.some

只要有一个满足条件就会返回true

##### (3.filter

把满足条件的数过滤出来

##### (4.map

映射函数，用于改数组中的内容

##### (5.foreach

遍历所有元素

##### (6.reduce

实现累加的效果

```javascript
let arr=[1,2,3,4];
let res=arr.reduce((item1,item2)=>item1+item2);//item1+item2作为item1重新进入作为回调函数的item1
console.log(res);//结果：10
```

#### (8).迭代器对象：有 Symbol.iterator 属性（能 for of）

迭代器就是一个拥有next()方法的对象，每次调用返回{value,done},value表示当前值，done表示是否遍历结束(boolean类型)

Arr,Set,Map,String,arguements,NodeList内置对象部署了symbol.iterator接口

拿迭代器：

```javascript
const arr = [1,2,3]
const it = arr[Symbol.iterator]()

console.log(it.next()) // {value:1,done:false}
console.log(it.next()) // {value:2,done:false}
console.log(it.next()) // {value:3,done:false}
console.log(it.next()) // {value:undefined,done:true}
```

#### (9).arr.from

arr.from是js内置方法，，用来把类数组对象或可迭代对象转成真正的数组

基础语法：

```javascript
Array.from(类数组/可迭代对象, 映射函数?, this指向?)
```

### 2.栈结构

