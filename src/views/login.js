function logar(){
  const login = document.getElementById('login').value;
  const senha = document.getElementById('senha').value;

  if(login == "admin" && senha == "admin" ){
      alert('Sucesso!');
      location.href = "home.ejs ";

  }else{
      alert('Usuario ou senha incorretos');
  }
  }
