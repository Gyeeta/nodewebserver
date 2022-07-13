'use strict';

const 		crypto = require('crypto');

class EvalError extends Error 
{
	constructor(message) 
	{
		super(message);
		this.name = this.constructor.name;
	}
};

/*
 * Disjunctive Normalization of a Logical (Boolean) expression
 *
 * Input is the logical  expression in string format.
 * Output is the Normalized Object
 */
module.exports = {
	evaluateFilter : function (origstr) {
		const 		OPERAND = "operand";
		const 		OPERATOR = "operator";
		const 		OPER_AND = "AND";
		const 		OPER_OR = "OR";
		const 		OPER_NOT = "NOT";
		
		let 		finalExprTree;
		let 		expressionArray = [];
		let 		escbrace = 0;

		let normalizedNode = {
			data: "",
			children: []
		};

		function IsLeafNode(node) {
			if (isOperand(node.data)) return true;
			else return false;
		}

		function evalExprTree(root) {
			// empty tree
			if (!root || root == undefined) return 0;

			// leaf node i.e, an operand
			if (IsLeafNode(root)) return root;

			// Evaluate left subtree
			let l_node = evalExprTree(root.left);

			// Evaluate right subtree
			let r_node = evalExprTree(root.right);

			if (root.data == OPER_AND) {
				let temp = evaluateAndTree(root);
				root.left = temp.left;
				root.right = temp.right;
				root.data = temp.data;
				return root;
			} else if (root.data == OPER_OR) {
				root.left = l_node;
				root.right = r_node;
				return root;
			}
		}

		function evaluateAndTree(node) {
			if (isOperand(node.data)) {
				return node.data;
			} else {
				let left = node.left;
				let right = node.right;

				if (node.data == OPER_AND) {
					if (
							IsLeafNode(left) &&
							IsLeafNode(right.left) &&
							IsLeafNode(right.right) &&
							right.data == OPER_OR
					   ) {
						let postfix = [];
						if (isOperand(left.data)) {
							postfix.push(right.left.data);
							postfix.push(left.data);
							postfix.push(node.data);
							postfix.push(right.right.data);
							postfix.push(left.data);
							postfix.push(node.data);
							postfix.push(right.data);
						}
						return ConstructTree(postfix);
					} else if (
							IsLeafNode(right) &&
							IsLeafNode(left.left) &&
							IsLeafNode(left.right) &&
							left.data == OPER_OR
						  ) {
						let postfix = [];
						if (isOperand(right.data)) {
							postfix.push(left.left.data);
							postfix.push(right.data);
							postfix.push(node.data);

							postfix.push(left.right.data);
							postfix.push(right.data);
							postfix.push(node.data);

							postfix.push(left.data);

							return ConstructTree(postfix);
						}
					} else if (
							IsLeafNode(left) &&
							isOperator(right.data) &&
							IsLeafNode(right.left) &&
							IsLeafNode(right.right)
						  ) {
						let postfix = [];
						postfix.push(left.data);
						postfix.push(right.left.data);
						postfix.push(node.data);

						postfix.push(left.data);
						postfix.push(right.right.data);
						postfix.push(node.data);

						postfix.push(node.data);
						return ConstructTree(postfix);
					} else if (
							isOperator(right.data) &&
							IsLeafNode(right.left) &&
							IsLeafNode(right.right) &&
							IsLeafNode(left.left) &&
							IsLeafNode(left.right) &&
							(left.data == OPER_OR && right.data == OPER_AND)
						  ) {
						let postfix = [];
						postfix.push(left.left.data);
						postfix.push(right.left.data);
						postfix.push(node.data);

						postfix.push(left.left.data);
						postfix.push(right.right.data);
						postfix.push(node.data);

						postfix.push(node.data);

						postfix.push(left.right.data);
						postfix.push(right.left.data);
						postfix.push(node.data);

						postfix.push(left.right.data);
						postfix.push(right.right.data);
						postfix.push(node.data);

						postfix.push(node.data);
						postfix.push(left.data);

						return ConstructTree(postfix);
					} else if (
							//LEFT and RIGHT both are leaf nodes
							isOperator(right.data) &&
							IsLeafNode(right.left) &&
							IsLeafNode(right.right) &&
							IsLeafNode(left.left) &&
							IsLeafNode(left.right)
						  ) {
						let postfix = [];
						postfix.push(left.right.data);
						postfix.push(right.left.data);
						postfix.push(node.data);

						postfix.push(left.left.data);
						postfix.push(right.left.data);
						postfix.push(node.data);

						postfix.push(left.data);

						postfix.push(left.left.data);
						postfix.push(right.right.data);
						postfix.push(node.data);

						postfix.push(left.right.data);
						postfix.push(right.right.data);
						postfix.push(node.data);
						postfix.push(left.data);

						//postfix.push(left.data);
						postfix.push(right.data);
						return ConstructTree(postfix);
					} else if (IsLeafNode(left) && !IsLeafNode(right)) {
						let newNode1 = {};
						newNode1.data = node.data;
						newNode1.left = left;
						newNode1.right = right.left;

						let newNode2 = {};
						newNode2.data = node.data;
						newNode2.left = left;
						newNode2.right = right.right;

						let resRight = evaluateAndTree(newNode2);
						let resLeft = evaluateAndTree(newNode1);

						let result = {};
						result.data = right.data;
						result.left = resLeft;
						result.right = resRight;
						return result;
					} else if (IsLeafNode(right) && !IsLeafNode(left)) {
						let newNode1 = {};
						newNode1.data = node.data;
						newNode1.left = right;
						newNode1.right = left.left;

						let newNode2 = {};
						newNode2.data = node.data;
						newNode2.left = right;
						newNode2.right = left.right;

						let resRight = evaluateAndTree(newNode2);
						let resLeft = evaluateAndTree(newNode1);

						let result = {};
						result.data = left.data;
						result.left = resLeft;
						result.right = resRight;
						return result;
					} else if (!IsLeafNode(left) && !IsLeafNode(right)) {
						let resultRight = {};
						let resultLeft = {};
						let n = {};

						if (left.data !== right.data) {
							let t_left = {};
							let t_right = {};
							//swap OR to left and AND to right
							if (left.data == OPER_OR) {
								t_left = left;
								t_right = right;
							} else if ((right.data = OPER_OR)) {
								t_left = right;
								t_right = left;
							}
							let newNode1 = {};
							newNode1.data = node.data;
							newNode1.left = t_left.left;
							newNode1.right = t_right;

							let newNode2 = {};
							newNode2.data = node.data;
							newNode2.left = t_left.right;
							newNode2.right = t_right;

							resultLeft = evaluateAndTree(newNode1);
							resultRight = evaluateAndTree(newNode2);

							n.data = t_left.data;
							n.left = resultLeft;
							n.right = resultRight;
						} else {
							let newNode1 = {};
							newNode1.data = node.data;
							newNode1.left = left.left;
							newNode1.right = right.left;

							let newNode2 = {};
							newNode2.data = node.data;
							newNode2.left = left.left;
							newNode2.right = right.right;

							let firstRight = evaluateAndTree(newNode2);
							let firstLeft = evaluateAndTree(newNode1);

							let newNode3 = {};
							newNode3.data = node.data;
							newNode3.left = left.right;
							newNode3.right = right.left;

							let newNode4 = {};
							newNode4.data = node.data;
							newNode4.left = left.right;
							newNode4.right = right.right;

							let secondRight = evaluateAndTree(newNode3);
							let secondLeft = evaluateAndTree(newNode4);
							//resultRight.data = secondLeft.data;
							resultRight.data = left.data;
							resultRight.left = secondLeft;
							resultRight.right = secondRight;

							//resultLeft.data = firstRight.data;
							resultLeft.data = left.data;
							resultLeft.left = firstLeft;
							resultLeft.right = firstRight;

							n.data = resultRight.data;
							n.left = resultLeft;
							n.right = resultRight;
						}

						return n;
					} else {
						return node;
					}
				} else {
					return node;
				}
			}
		}

		function height(node) {
			if (node == "" || node == undefined) return 0;
			else {
				/* compute the height of each subtree */
				let lheight = height(node.left);
				let rheight = height(node.right);

				/* use the larger one */
				if (lheight > rheight) return lheight + 1;
				else return rheight + 1;
			}
		}

		function fromSetToArray(set) {
			let arr = [];
			for (let it = set.values(), val = null; (val = it.next().value); ) {
				//console.log(val);
				let obj = {};
				obj.data = val;
				obj.left = "";
				obj.right = "";
				arr.push(obj);
			}
			return arr;
		}
		//remove duplicates from an array
		function getUnique(arr) {
			let map = new Map();
			let clean = [];
			for (let i = 0; i < arr.length; ++i) {
				let obj = arr[i];
				if (typeof obj == "object") {
					if (IsLeafNode(obj) && isOperand(obj.data)) {
						if (!map.has(obj.data)) map.set(obj.data, obj);
					} else {
						clean.push(obj);
					}
				}
			}

			for (let it = map.values(), val = null; (val = it.next().value); ) {
				clean.push(val);
			}
			return clean;
		}

		function ClubExpressionTree(root) {
			if (root == null || root == undefined) return null;

			if (isOperand(root.data)) return root;

			let left = ClubExpressionTree(root.left);
			let right = ClubExpressionTree(root.right);

			if (typeof root !== 'object') {
				throw new Error("Invalid Filter expression : Please check the brace counts");
			}	

			root.children = [];

			if (left !== undefined && root.data == left.data) {
				//if left has already been processed
				if (left.children) {
					root.children = root.children.concat(left.children);
				}
				root.children.push(left.left);
				root.children.push(left.right);
				root.left = "";
			} else {
				root.children.push(left);
				root.left = "";
			}

			if (right !== undefined && root.data == right.data) {
				//if right has already been processed
				if (right.children) {
					root.children = root.children.concat(right.children);
				}
				root.children.push(right.left);
				root.children.push(right.right);
				root.right = "";
			} else {
				root.children.push(right);
				root.right = "";
			}
			root.children = getUnique(root.children);
			return root;
		}

		function isComma(ch) {
			return ch === ",";
		}

		function isDigit(ch) {
			return /\d/.test(ch);
		}

		function isLetter(ch) {
			return /[a-z]/i.test(ch);
		}

		function isOperator(word) {
			if (
					word != undefined &&
					(word.toUpperCase() === OPER_AND ||
					 word.toUpperCase() === OPER_OR ||
					 word === "&" ||
					 word === "|")
			   )
				return true;
			else {
				return false;
			}
		}

		function isOperand(word) {
			if (word == undefined) return false;
			word = word.trim();
			if (word.length === 0) return false;
			if (
					isOperator(word) === false &&
					isLeftParenthesis(word) === false &&
					isRightParenthesis(word) === false
			   ) {
				return true;
			} else {
				return false;
			}
		}

		function isLeftParenthesis(ch) {
			return ch === "(";
		}

		function isRightParenthesis(ch) {
			return ch === ")";
		}

		function ConstructTree(exprArray) {
			let stack = [];

			for (let i = 0; i < exprArray.length; ++i) {
				if (isOperator(exprArray[i]) == false) {
					//let tmp = new Tree(exprArray[i]);
					let tmp = {
						data: exprArray[i],
						left: "",
						right: ""
					};
					stack.push(tmp);
				} else {
					let leftnode = stack.pop();
					let rightnode = stack.pop();
					let tree = {
						data: exprArray[i],
						left: leftnode,
						right: rightnode
					};
					stack.push(tree);
					//console.log("pushed tree in stack " + tree);
				}
			}
			finalExprTree = stack.pop();
			return finalExprTree;
		}

		function validateBrackets(expr) {
			let 		tmp = 0, is_str_dbl = false, is_str_sing = false;
			let 		outstr = "", nbrstart = 0, nbrend = 0;

			for (let i = 0; i < expr.length; ++i) {
				let ch = expr[i];

				if ((ch === "\"") && (i > 0)) {
					if (is_str_dbl === true) {
						if (expr[i - 1] !== '\\') {
							is_str_dbl = false;
						}	
					}
					else {
						is_str_dbl = true;
					}	
				}	
				else if ((ch === "'") && (i > 0)) {
					if (is_str_sing === true) {
						if (expr[i - 1] !== '\\') {
							is_str_sing = false;
						}	
					}
					else {
						is_str_sing = true;
					}	
				}

				if (is_str_sing || is_str_dbl) {
					if (ch === "}") {
						escbrace++;
						outstr += "___^^^___";
					}
					else {
						outstr += ch;
					}	
					continue;
				}	

				outstr += ch;

				if (ch === "(") tmp++;
				else if (ch === ")" && --tmp < 0) throw new EvalError("[Invalid Filter] : Unexpected \')\' seen in filter string");
			}

			if (tmp === 0) {
				if ((-1 === outstr.indexOf('({')) && (-1 === outstr.indexOf('})'))) {
					return '({ ' + outstr + '})';
				}	
				return outstr;
			}	
			throw new EvalError("[Invalid Filter] : Unbalanced brackets ()");
		}

		function ValidateExpressionString(str) {
			str = str.trim();

			expressionArray = [];
			let nested = str.match(/[^()]+/g);
			if (nested == null) {
				return false;
			}
			//console.log(nested);
			for (let i = 0; i < nested.length; ++i) {
				nested[i] = nested[i].trim();
				//let tmp = nested[i].split(" ");
				let tmp = nested[i].split("");
				tmp = tmp.filter(function(entry) {
						return /\S/.test(entry);
						});
				expressionArray = expressionArray.concat(tmp);
			}

			let exprCount = expressionArray.length;
			if (expressionArray.length < 3) {
				return false;
			} else if (
					isOperand(expressionArray[0].trim()) &&
					isOperand(expressionArray[exprCount - 1].trim()) == false
				  ) {
				return false;
			} else {
				str = str.trim().toUpperCase();

				str = str.replace(/}[ \t]*AND[ \t]*{/gi, "} & {");
				str = str.replace(/[)][ \t]*AND[ \t]*[(]/gi, ") & (");

				str = str.replace(/}[ \t]*OR[ \t]*{/gi, "} | {");
				str = str.replace(/[)][ \t]*OR[ \t]*[(]/gi, ") | (");

				let exprArr = [];
				let previous = OPERATOR;
				let operand = [];

				for (let j = 0; j < str.length; ++j) {
					let token = str[j].trim();
					if (token == "") continue;

					if (token === "{") {
						operand.push(token);
						token = "";
					} else if (operand.length > 0) {
						if (token === "}") {
							operand.shift();
							token = operand.join("");
							operand = [];
						} else {
							operand.push(token);
							token = "";
						}
					}
					if (token === "") continue;

					if (isOperand(token)) {
						exprArr.push(token);
					}
					if (isOperator(token)) {
						exprArr.push(token);
					}
				}

				for (let i = 0; i < exprArr.length; ++i) {
					if (isOperator(exprArr[i].trim()) && previous == OPERAND) {
						previous = OPERATOR;
					} else if (isOperand(exprArr[i].trim()) && previous == OPERATOR) {
						previous = OPERAND;
					} else {
						//console.log("replaced -> " + str);
						return false;
					}
				}
				return true;
			}
		}

		function parseExpressionString(str) {
			//replace AND , OR string to & and | for ease of parsing

			str = str.replace(/}[ \t]*AND[ \t]*{/gi, "} & {");
			str = str.replace(/[)][ \t]*AND[ \t]*[(]/gi, ") & (");

			str = str.replace(/}[ \t]*OR[ \t]*{/gi, "} | {");
			str = str.replace(/[)][ \t]*OR[ \t]*[(]/gi, ") | (");

			expressionArray = [];

			//let nested = str.match(/[^()]+/g);
			let nested = str.split("");
			let postfixArray = [];
			let stack = [];
			stack.push("(");

			nested = nested.concat([")"]);
			let operand = [];

			for (let i = 0; i < nested.length; ++i) {
				let token = nested[i];
				if (token === "{") {
					operand.push(token);
					token = "";
				} else if (operand.length > 0) {
					if (token === "}") {
						operand.shift();
						token = operand.join("");
						operand = [];
					} else {
						operand.push(token);
						token = "";
					}
				}
				if (token === "") continue;

				if (isLeftParenthesis(token)) {
					stack.push(token);
				} else if (isOperator(token)) {
					let x = stack.pop();
					while (isOperator(x) === true) {
						postfixArray.push(x); /* so pop all higher precendence operator and */
						x = stack.pop(); /* add them to postfix expresion */
					}
					stack.push(x);
					/* because just above while loop will terminate we have
					   oppped one extra item
					   for which condition fails and loop terminates, so that one*/

					if (token == "&") token = OPER_AND;
					if (token == "|") token = OPER_OR;
					stack.push(token); /* push current oprerator symbol onto stack */
				} else if (isRightParenthesis(token)) {
					/* pop and keep popping until '(' encounterd */
					let x = stack.pop();
					while (isLeftParenthesis(x) == false) {
						postfixArray.push(x);
						x = stack.pop();
					}
				} else if (isOperand(token)) {
					postfixArray.push(token);
				}
			}
			return postfixArray;
		}

		function AddDataHashes(obj)
		{

			function modifyProp(o) 
			{
				Object.keys(o).forEach(function (k) {
					if (o[k] !== null && (typeof o[k] === 'object')) {
						modifyProp(o[k]);
						return;
					}

					if (typeof o[k] === 'string') {

						if (k !== 'data') {
							if ((k === 'left') || (k === 'right')) {
								delete o[k];
							}
							return;
						}	

						if ((o[k] === 'AND') || (o[k] === 'OR')) {
							o["oper"] = o[k];
							delete o[k]
							return;
						}	

						const trimstr = o[k].trim();

						if ((trimstr.indexOf(" ") === -1) && (trimstr.indexOf("\t") === -1)) {
							throw new Error("Invalid Filter Expression : Expression must be of format \"({ <Param> <Operator> <Value> })\"");
						}
						else if (trimstr.length >= 4096) {
							throw new Error("Filter Criterion too large : Each expression must be at most 4096 bytes");
						}	

						o[k] = trimstr;

						// Truncated hash
						o["hash"] = crypto.createHash('md5').update(o[k]).digest('hex').slice(0, 16);
					}
				});

			}

			modifyProp(obj);
			
			return obj;
		}	

		function CreateFinalExpressionObject(str) {
			let postfixArray = parseExpressionString(str); //create postfix exrpession array from string expression
			let finalTree = ConstructTree(postfixArray); //expression tree constucted from postfix array

			let treeConverted = evalExprTree(finalTree); //expression tree evaluated and expanded for OR operation
			let clubbedTree = ClubExpressionTree(treeConverted); //tree clubbed with same operator on same level

			let		outexpr;

			if (escbrace !== 0) {
				
				let 	outstr = JSON.stringify(clubbedTree, ['data', 'children']);
				
				outexpr = JSON.parse(outstr.replace(/___\^\^\^___/gi, "}"));
			}
			else {
				outexpr = clubbedTree;
			}	
			
			return AddDataHashes(outexpr);
		}

		if (!origstr) return "";

		origstr = origstr.trim();

		if (origstr.length > 8192) {
			throw new EvalError(`Max Filter Expression length exceeded Max is 8192 (8KB) : Input Filter is of length ${origstr.length}`);
		}
		else if (origstr.length === 0) {
			return "";
		}	

		origstr = validateBrackets(origstr);

		if (ValidateExpressionString(origstr)) {
			
			return CreateFinalExpressionObject(origstr);
		} 
		else {
			throw new EvalError("[Invalid Filter] : Please check if expression is within both round and curly braces as in ({ <Param> <Operator> <Value> }) and valid operator symbols used");
		}
	}
};


// See tests/test_filter_expr.js for examples

