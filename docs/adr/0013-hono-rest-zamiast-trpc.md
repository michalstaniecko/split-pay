# Hono + REST z typowanym klientem zamiast tRPC

API jest w Hono, z walidacją Zod i klientem `hc` współdzielonym przez aplikację i www. To daje typowanie end-to-end bez generowania kodu, a API pozostaje zwykłym REST-em. tRPC odrzuciliśmy, bo publiczne endpointy (podgląd www przez link, Open Graph, webhooki) potrzebują przewidywalnych URL-i.
