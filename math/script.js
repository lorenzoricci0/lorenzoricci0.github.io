const display = document.getElementById('display');
let currentInput = "";
let previousInput = "";
let operation = null;

// numeri
const numberButtons = document.querySelectorAll('.btn-number');
numberButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if(currentInput.length < 12){ // limite cifre
      currentInput += btn.textContent;
      updateDisplay();
    }
  });
});

// operatori
const operatorButtons = document.querySelectorAll('.btn-operator');
operatorButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if(currentInput === "") return;
    if(previousInput !== ""){
      compute();
    }
    operation = btn.textContent;
    previousInput = currentInput;
    currentInput = "";
  });
});

// uguale
const equalButton = document.querySelector('.btn-equal');
equalButton.addEventListener('click', () => {
  if(currentInput === "" || previousInput === "") return;
  compute();
  operation = null;
});

// clear
const clearButton = document.querySelector('.btn-clear');
clearButton.addEventListener('click', () => {
  currentInput = "";
  previousInput = "";
  operation = null;
  updateDisplay();
});

// funzioni
function updateDisplay(){
  display.textContent = currentInput || "0";
}

function compute(){
  let result;
  const prev = parseFloat(previousInput);
  const curr = parseFloat(currentInput);

  switch(operation){
    case '+':
      result = prev + curr;
      break;
    case '-':
      result = prev - curr;
      break;
    case '*':
      result = prev * curr;
      break;
    case '/':
      result = curr === 0 ? "Errore" : prev / curr;
      break;
    default:
      return;
  }

  currentInput = result.toString();
  previousInput = "";
  updateDisplay();
}
