const buttons = document.getElementsByClassName('button');
const countDisplay = document.getElementById('count');



let count = 0;
function updateDisplay() {
  countDisplay.textContent = count;
}

buttons[0].addEventListener('click', () => {
  count--;
  updateDisplay();
});
buttons[1].addEventListener('click', () => {
  count=0;
  updateDisplay();
});
buttons[2].addEventListener('click', () => {
  count++;
  updateDisplay();
});


updateDisplay();