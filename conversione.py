import os
import markdown
from markdown_katex import KatexExtension

# Funzione per leggere il file Markdown
def read_markdown_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        return f.read()

# Funzione per convertire Markdown a HTML con supporto per LaTeX (KaTeX)
def markdown_to_html(markdown_text):
    md = markdown.Markdown(extensions=[KatexExtension()])
    return md.convert(markdown_text)

# Funzione per inserire l'HTML generato nel template
def generate_html_page(content, title="Matematica", subtitle="Circonferenza e Cerchio"):
    template = f"""
    <!DOCTYPE html>
    <html lang="it">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>{title}</title>
      <link rel="stylesheet" href="../../style.css">
      <script src="https://cdn.jsdelivr.net/npm/katex@0.13.11/dist/katex.min.js" defer></script>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.13.11/dist/katex.min.css">
      <script src="https://cdn.jsdelivr.net/npm/katex@0.13.11/dist/contrib/auto-render.min.js" defer
        onload="renderMathInElement(document.body);"></script>
      <script src="js/script.js" defer></script>
    </head>
    <body>
      <header>
        <h1><a class="titolo" href="../../index.html">{title}</a></h1>
        <p>{subtitle}</p>
      </header>

      <main>
        {content}
      </main>

      <footer>
        <p>&copy; 2024 Wiki di Matematica</p>
      </footer>
    </body>
    </html>
    """
    return template

# Funzione per convertire tutti i file Markdown in una cartella a HTML
def convert_all_markdown_files(input_folder, output_folder):
    # Assicurati che la cartella di output esista
    os.makedirs(output_folder, exist_ok=True)
    
    # Itera attraverso tutti i file Markdown nella cartella
    for filename in os.listdir(input_folder):
        if filename.endswith(".md"):
            file_path = os.path.join(input_folder, filename)
            output_filename = filename.replace(".md", ".html")
            output_path = os.path.join(output_folder, output_filename)
            
            # Leggi e converti il file Markdown
            markdown_text = read_markdown_file(file_path)
            html_content = markdown_to_html(markdown_text)
            
            # Genera la pagina HTML
            full_html = generate_html_page(html_content, title="Matematica", subtitle=filename.replace(".md", ""))
            
            # Salva il risultato come file HTML
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(full_html)
            
            print(f"Pagina HTML generata: {output_path}")

# Esempio di utilizzo:
input_folder = 'files-di-testo'  # Cartella con file Markdown
output_folder = 'pagine-create-dallo-script'    # Cartella di destinazione per i file HTML

convert_all_markdown_files(input_folder, output_folder)
