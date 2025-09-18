const proteinsQuantity = document.getElementById('proteins-quantity');
const grainsQuantity = document.getElementById('grains-quantity');
const sugarsQuantity = document.getElementById('sugars-quantity');
const vegQuantity = document.getElementById('vegetables-quantity');

const button = document.getElementById('button');
const result = document.getElementById('result');

button.addEventListener('click', () => {
    const proteins = parseFloat(proteinsQuantity.value) || 0;
    const grains = parseFloat(grainsQuantity.value) || 0;
    const sugars = parseFloat(sugarsQuantity.value) || 0;
    const veg = parseFloat(vegQuantity.value) || 0;

    const number = proteins + grains + sugars + veg;

    const meco = number*0.33;

    const total = proteins*2 + grains*1.5 + sugars*2 + veg*1.5;


    result.textContent = `meco gives me ${total - meco}`;

});

